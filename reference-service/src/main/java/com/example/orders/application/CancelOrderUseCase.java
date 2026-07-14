package com.example.orders.application;

import com.example.orders.application.dto.CancelOrderResultDto;

public interface CancelOrderUseCase {

    CancelOrderResultDto cancel(String orderId, String reason);
}
