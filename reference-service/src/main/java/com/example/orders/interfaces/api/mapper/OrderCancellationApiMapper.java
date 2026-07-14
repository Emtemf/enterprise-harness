package com.example.orders.interfaces.api.mapper;

import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.interfaces.api.dto.CancelOrderResponse;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderCancellationApiMapper {

    CancelOrderResponse toResponse(CancelOrderResultDto resultDto);
}
