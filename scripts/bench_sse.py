#!/usr/bin/env python3
"""Banc SSE HTTP : durée effective par client, réception de deltas et retard watermark → arrivée.

  python3 scripts/bench_sse.py --url http://localhost:8080 --clients 400 --duration 60

Échec si un client est coupé/refusé, ne reçoit pas assez de deltas valides, reçoit resync,
ou si le retard p95 dépasse --max-p95-seconds (3 s par défaut). Horloges synchronisées requises.
Bibliothèque standard seule ; machine et volumétrie doivent accompagner toute mesure publiée.
"""
import argparse
import asyncio
import json
import math
import statistics
import sys
import time
from datetime import datetime
from urllib.parse import urlparse


def percentile(values, p):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p))] if ordered else float("nan")


async def client(host, port, path, duration, connect_timeout, stats):
    writer = None
    lags = []
    stats["client_lags"].append(lags)
    try:
        # Inclut la connexion ET les en-têtes : un serveur muet ne bloque pas le banc.
        async with asyncio.timeout(connect_timeout):
            reader, writer = await asyncio.open_connection(host, port, limit=4 * 1024 * 1024)
            writer.write(f"GET {path} HTTP/1.0\r\nHost: {host}:{port}\r\nAccept: text/event-stream\r\n\r\n".encode())
            await writer.drain()
            status = (await reader.readline()).decode(errors="replace").split()
            if len(status) < 2 or status[1] != "200":
                stats["refused"] += 1
                return
            while True:
                header = await reader.readline()
                if header in (b"\r\n", b"\n"):
                    break
                if not header:
                    stats["closed"] += 1
                    return
        stats["connected"] += 1
        # Chaque client mesure une durée entière APRÈS ses en-têtes, avec une horloge monotone.
        deadline = time.monotonic() + duration
        event = None
        data = []
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                stats["completed"] += 1
                return
            try:
                line = await asyncio.wait_for(reader.readline(), timeout=remaining)
            except asyncio.TimeoutError:
                stats["completed"] += 1
                return
            if not line:
                stats["closed"] += 1
                return
            text = line.decode(errors="replace").rstrip("\r\n")
            if text.startswith("event:"):
                event = text[6:].strip()
            elif text.startswith("data:"):
                data.append(text[5:].lstrip(" "))
            elif not text:
                if event is not None and data:
                    stats["messages"][event] = stats["messages"].get(event, 0) + 1
                    if event == "delta":
                        try:
                            watermark = json.loads("\n".join(data))["watermark"]
                            stamp = datetime.fromisoformat(watermark.replace("Z", "+00:00"))
                            if stamp.tzinfo is None:
                                raise ValueError("Watermark sans fuseau")
                            lag = time.time() - stamp.timestamp()
                            if not math.isfinite(lag) or lag < 0:
                                raise ValueError("Horloges incohérentes")
                            lags.append(lag)
                            stats["lags"].append(lag)
                        except (ValueError, KeyError, TypeError, AttributeError, OverflowError):
                            stats["invalid_deltas"] += 1
                event, data = None, []
    except (OSError, asyncio.TimeoutError, ValueError):
        stats["connect_errors"] += 1
    finally:
        if writer is not None:
            writer.close()
            try:
                await asyncio.wait_for(writer.wait_closed(), timeout=1)
            except (OSError, asyncio.TimeoutError):
                pass


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8080")
    parser.add_argument("--clients", type=int, default=400)
    parser.add_argument("--duration", type=float, default=60)
    parser.add_argument("--connect-timeout", type=float, default=10)
    parser.add_argument("--min-deltas", type=int, default=1, help="Minimum de deltas valides PAR client")
    parser.add_argument("--max-p95-seconds", type=float, default=3)
    args = parser.parse_args()
    if args.clients < 1 or args.min_deltas < 1 or any(
        not math.isfinite(v) or v <= 0 for v in (args.duration, args.connect_timeout, args.max_p95_seconds)
    ):
        parser.error("Clients, durée, délai, deltas et seuil p95 doivent être strictement positifs et finis")
    target = urlparse(args.url)
    if target.scheme != "http" or not target.hostname or target.username or target.password or target.query or target.fragment:
        parser.error("URL HTTP attendue, sans identifiants, query ni fragment ; utiliser un accès de test autorisé")
    path = target.path.rstrip("/") + "/api/v1/stream"
    stats = {"connected": 0, "completed": 0, "refused": 0, "connect_errors": 0, "closed": 0,
             "invalid_deltas": 0, "messages": {}, "lags": [], "client_lags": []}
    started = time.monotonic()
    await asyncio.gather(*(client(target.hostname, target.port or 80, path, args.duration, args.connect_timeout, stats)
                           for _ in range(args.clients)))
    lags = stats["lags"]
    print(f"clients demandés={args.clients} connectés={stats['connected']} durée complète={stats['completed']} "
          f"refusés={stats['refused']} erreurs={stats['connect_errors']} coupés={stats['closed']} "
          f"durée du banc={time.monotonic() - started:.2f}s")
    print(f"messages={stats['messages']} deltas invalides={stats['invalid_deltas']}")
    if lags:
        print(f"retard des deltas (s) : p50={statistics.median(lags):.2f} p95={percentile(lags, 0.95):.2f} "
              f"p99={percentile(lags, 0.99):.2f} max={max(lags):.2f} sur {len(lags)} messages")
    sufficient = all(len(values) >= args.min_deltas for values in stats["client_lags"])
    latency_ok = all(values and percentile(values, 0.95) <= args.max_p95_seconds for values in stats["client_lags"])
    passed = (stats["completed"] == args.clients and stats["connected"] == args.clients
              and stats["closed"] == stats["connect_errors"] == stats["refused"] == stats["invalid_deltas"] == 0
              and stats["messages"].get("resync", 0) == 0 and sufficient and latency_ok)
    print("PASS" if passed else "FAIL : durée, réception, intégrité ou latence hors critères")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
