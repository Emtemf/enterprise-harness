package com.example.orders.application;

import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.application.mapper.OrderCancellationApplicationMapper;
import com.example.orders.domain.OrderCancellationPolicy;
import com.example.orders.domain.OrderRecord;
import com.example.orders.domain.repository.OrderRepository;
import org.springframework.stereotype.Service;

@Service
public class OrderCancellationService implements CancelOrderUseCase {

    private final OrderRepository orderRepository;
    private final OrderCancellationPolicy orderCancellationPolicy;
    private final OrderCancellationApplicationMapper orderCancellationApplicationMapper;

    public OrderCancellationService(
            OrderRepository orderRepository,
            OrderCancellationPolicy orderCancellationPolicy,
            OrderCancellationApplicationMapper orderCancellationApplicationMapper
    ) {
        this.orderRepository = orderRepository;
        this.orderCancellationPolicy = orderCancellationPolicy;
        this.orderCancellationApplicationMapper = orderCancellationApplicationMapper;
    }

    @Override
    public CancelOrderResultDto cancel(String orderId, String reason) {
        OrderRecord existingOrder = orderRepository.findById(orderId)
                .orElseThrow(() -> new IllegalArgumentException("order not found: " + orderId));

        if (!orderCancellationPolicy.canCancel(existingOrder.status())) {
            throw new IllegalStateException("order cannot be cancelled in status: " + existingOrder.status());
        }

        OrderRecord cancelledOrder = orderRepository.save(existingOrder.cancel(reason));
        return orderCancellationApplicationMapper.toResultDto(cancelledOrder);
    }
}
