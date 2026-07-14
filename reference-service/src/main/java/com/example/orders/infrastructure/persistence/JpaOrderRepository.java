package com.example.orders.infrastructure.persistence;

import com.example.orders.domain.OrderRecord;
import com.example.orders.domain.repository.OrderRepository;
import com.example.orders.infrastructure.persistence.mapper.OrderPersistenceMapper;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public class JpaOrderRepository implements OrderRepository {

    private final OrderJpaRepository orderJpaRepository;
    private final OrderPersistenceMapper orderPersistenceMapper;

    public JpaOrderRepository(OrderJpaRepository orderJpaRepository, OrderPersistenceMapper orderPersistenceMapper) {
        this.orderJpaRepository = orderJpaRepository;
        this.orderPersistenceMapper = orderPersistenceMapper;
    }

    @Override
    public Optional<OrderRecord> findById(String orderId) {
        return orderJpaRepository.findById(orderId)
                .map(orderPersistenceMapper::toDomain);
    }

    @Override
    public OrderRecord save(OrderRecord orderRecord) {
        OrderEntity saved = orderJpaRepository.save(orderPersistenceMapper.toEntity(orderRecord));
        return orderPersistenceMapper.toDomain(saved);
    }
}
