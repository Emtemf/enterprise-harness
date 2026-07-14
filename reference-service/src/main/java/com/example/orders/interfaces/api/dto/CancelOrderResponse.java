package com.example.orders.interfaces.api.dto;

public record CancelOrderResponse(
        String orderId,
        String status,
        String reason
) {
}
