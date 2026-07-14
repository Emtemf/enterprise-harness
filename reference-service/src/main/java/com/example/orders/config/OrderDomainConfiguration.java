package com.example.orders.config;

import com.example.orders.domain.OrderCancellationPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OrderDomainConfiguration {

    @Bean
    public OrderCancellationPolicy orderCancellationPolicy() {
        return new OrderCancellationPolicy();
    }
}
