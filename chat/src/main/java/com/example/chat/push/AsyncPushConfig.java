package com.example.chat.push;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.ThreadPoolExecutor;

@Configuration
@EnableAsync
@EnableScheduling
public class AsyncPushConfig {


    /**
     * Dedicated executor for push delivery.
     *
     * IMPORTANT: @EnableAsync must stay — without it, @Async("pushExecutor")
     * on PushDispatcher is silently ignored and pushes would run inline on
     * the STOMP/REST thread, exactly what this design avoids.
     */
    @Bean(name = "pushExecutor")
    public ThreadPoolTaskExecutor pushExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("push-");
        // Pushes are best-effort: on overflow, drop rather than stall the chat path.
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.DiscardPolicy());
        executor.initialize();

        return executor;
    }
}
