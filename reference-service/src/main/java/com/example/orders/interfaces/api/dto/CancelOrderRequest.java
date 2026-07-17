package com.example.orders.interfaces.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

public record CancelOrderRequest(
        @Schema(
                description = "Must contain at least one non-whitespace character.",
                minLength = 1,
                pattern = ".*\\S.*"
        )
        @NotBlank(message = "reason is required")
        String reason
) {
}
