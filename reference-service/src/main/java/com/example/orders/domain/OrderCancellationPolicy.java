package com.example.orders.domain;

public class OrderCancellationPolicy {

    public boolean canCancel(OrderStatus status) {
        return status == OrderStatus.CREATED;
    }
}
