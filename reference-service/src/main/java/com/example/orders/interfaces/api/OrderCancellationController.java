package com.example.orders.interfaces.api;

import com.example.orders.application.CancelOrderUseCase;
import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.interfaces.api.dto.ApiErrorResponse;
import com.example.orders.interfaces.api.dto.CancelOrderRequest;
import com.example.orders.interfaces.api.dto.CancelOrderResponse;
import com.example.orders.interfaces.api.mapper.OrderCancellationApiMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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

    @Operation(summary = "Cancel an order")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "200",
                    description = "Order cancelled",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = CancelOrderResponse.class))
            ),
            @ApiResponse(
                    responseCode = "400",
                    description = "Request validation or body parsing failed",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiErrorResponse.class))
            ),
            @ApiResponse(
                    responseCode = "404",
                    description = "Order not found",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiErrorResponse.class))
            ),
            @ApiResponse(
                    responseCode = "409",
                    description = "Order cannot be cancelled in current status",
                    content = @Content(mediaType = "application/json", schema = @Schema(implementation = ApiErrorResponse.class))
            )
    })
    @PostMapping("/{orderId}/cancel")
    public CancelOrderResponse cancelOrder(@PathVariable String orderId, @Valid @RequestBody CancelOrderRequest request) {
        CancelOrderResultDto result = cancelOrderUseCase.cancel(orderId, request.reason());
        return orderCancellationApiMapper.toResponse(result);
    }
}
