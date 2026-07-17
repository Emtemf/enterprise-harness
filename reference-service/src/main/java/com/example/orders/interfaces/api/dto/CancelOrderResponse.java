package com.example.orders.interfaces.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record CancelOrderResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        String orderId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        String status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        String reason
) {
}
