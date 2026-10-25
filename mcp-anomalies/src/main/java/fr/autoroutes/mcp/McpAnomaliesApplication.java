package fr.autoroutes.mcp;

import java.time.Clock;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
@ConfigurationPropertiesScan
public class McpAnomaliesApplication {

    public static void main(String[] args) {
        SpringApplication.run(McpAnomaliesApplication.class, args);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    StationCatalog stationCatalog(McpAnomaliesProperties properties) {
        return StationCatalog.load(properties.aliasesPath(), properties.stationsPath());
    }
}
