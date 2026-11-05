"""Contrat du banc de charge contre un vrai serveur HTTP local contrôlé."""
import asyncio
import contextlib
import io
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import bench_sse


class BenchSseTest(unittest.IsolatedAsyncioTestCase):
    async def run_bench(self, mode):
        handlers = []

        async def serve(reader, writer):
            handlers.append(asyncio.current_task())
            index = len(handlers)
            try:
                await reader.readuntil(b'\r\n\r\n')
                if mode == 'no_headers':
                    await reader.read()
                    return
                writer.write(b'HTTP/1.0 200 OK\r\nContent-Type: text/event-stream\r\n\r\n')
                if mode == 'closed':
                    return
                if mode not in ('silent',) and not (mode == 'starved_client' and index == 2):
                    stamp = datetime.now(timezone.utc) - timedelta(seconds=10 if mode == 'slow' else 0)
                    data = '{invalid' if mode == 'invalid' else '{"watermark":\n' + '"' + stamp.isoformat() + '"}'
                    payload = '\n'.join('data: ' + part for part in data.split('\n'))
                    writer.write(('event: delta\n' + payload + '\n\n').encode())
                    if mode == 'resync':
                        writer.write(b'event: resync\ndata: {}\n\n')
                await writer.drain()
                await reader.read()
            finally:
                writer.close()
                await writer.wait_closed()

        server = await asyncio.start_server(serve, '127.0.0.1', 0)
        port = server.sockets[0].getsockname()[1]
        args = ['bench_sse.py', '--url', f'http://127.0.0.1:{port}', '--clients', '2',
                '--duration', '0.15', '--connect-timeout', '0.1', '--max-p95-seconds', '0.5']
        try:
            with patch('sys.argv', args), contextlib.redirect_stdout(io.StringIO()):
                return await asyncio.wait_for(bench_sse.main(), 3)
        finally:
            server.close()
            await server.wait_closed()
            await asyncio.gather(*handlers)

    async def test_complete_streams_with_valid_multiline_deltas_pass(self):
        self.assertEqual(await self.run_bench('healthy'), 0)

    async def test_immediate_disconnects_without_messages_fail(self):
        self.assertEqual(await self.run_bench('closed'), 1)

    async def test_connected_but_silent_streams_fail(self):
        self.assertEqual(await self.run_bench('silent'), 1)

    async def test_each_client_must_receive_data(self):
        self.assertEqual(await self.run_bench('starved_client'), 1)

    async def test_excessive_latency_fails(self):
        self.assertEqual(await self.run_bench('slow'), 1)

    async def test_invalid_deltas_fail(self):
        self.assertEqual(await self.run_bench('invalid'), 1)

    async def test_resync_fails(self):
        self.assertEqual(await self.run_bench('resync'), 1)

    async def test_stalled_http_headers_are_bounded(self):
        self.assertEqual(await self.run_bench('no_headers'), 1)


if __name__ == '__main__':
    unittest.main()
