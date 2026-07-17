package com.example.orders.interfaces.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record ApiErrorResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
        String error
) {
}
