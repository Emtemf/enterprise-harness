package com.example.orders.domain.repository;

import com.example.orders.domain.OrderRecord;

import java.util.Optional;

public interface OrderRepository {

    Optional<OrderRecord> findById(String orderId);

    OrderRecord save(OrderRecord orderRecord);
}
