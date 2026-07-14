package com.example.orders.application.dto;

public record CancelOrderResultDto(
        String orderId,
        String status,
        String reason
) {
}
