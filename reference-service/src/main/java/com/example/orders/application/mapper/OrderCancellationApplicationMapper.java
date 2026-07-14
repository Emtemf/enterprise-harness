package com.example.orders.application.mapper;

import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.domain.OrderRecord;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderCancellationApplicationMapper {

    @Mapping(target = "reason", source = "cancellationReason")
    CancelOrderResultDto toResultDto(OrderRecord orderRecord);
}
