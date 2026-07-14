package com.example.orders.infrastructure.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "orders")
public class OrderEntity {

    @Id
    @Column(name = "order_id", nullable = false, updatable = false)
    private String orderId;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "cancellation_reason")
    private String cancellationReason;

    protected OrderEntity() {
    }

    public OrderEntity(String orderId, String status, String cancellationReason) {
        this.orderId = orderId;
        this.status = status;
        this.cancellationReason = cancellationReason;
    }

    public String getOrderId() {
        return orderId;
    }

    public String getStatus() {
        return status;
    }

    public String getCancellationReason() {
        return cancellationReason;
    }
}
