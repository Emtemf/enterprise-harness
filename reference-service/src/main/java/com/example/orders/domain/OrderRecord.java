package com.example.orders.domain;

public record OrderRecord(
        String orderId,
        OrderStatus status,
        String cancellationReason
) {

    public OrderRecord cancel(String reason) {
        return new OrderRecord(orderId, OrderStatus.CANCELLED, reason);
    }
}
