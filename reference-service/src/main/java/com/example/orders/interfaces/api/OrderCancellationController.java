package com.example.orders.interfaces.api;

import com.example.orders.application.CancelOrderUseCase;
import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.interfaces.api.dto.CancelOrderRequest;
import com.example.orders.interfaces.api.dto.CancelOrderResponse;
import com.example.orders.interfaces.api.mapper.OrderCancellationApiMapper;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
public class OrderCancellationController {

    private final CancelOrderUseCase cancelOrderUseCase;
    private final OrderCancellationApiMapper orderCancellationApiMapper;

    public OrderCancellationController(CancelOrderUseCase cancelOrderUseCase, OrderCancellationApiMapper orderCancellationApiMapper) {
        this.cancelOrderUseCase = cancelOrderUseCase;
        this.orderCancellationApiMapper = orderCancellationApiMapper;
    }

    @PostMapping("/{orderId}/cancel")
    public CancelOrderResponse cancelOrder(@PathVariable String orderId, @Valid @RequestBody CancelOrderRequest request) {
        CancelOrderResultDto result = cancelOrderUseCase.cancel(orderId, request.reason());
        return orderCancellationApiMapper.toResponse(result);
    }
}
