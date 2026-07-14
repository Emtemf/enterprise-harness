package com.example.orders.interfaces.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CancelOrderRequest(
        @NotBlank(message = "reason is required")
        String reason
) {
}
