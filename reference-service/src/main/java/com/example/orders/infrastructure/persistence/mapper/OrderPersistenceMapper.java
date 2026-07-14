package com.example.orders.infrastructure.persistence.mapper;

import com.example.orders.domain.OrderRecord;
import com.example.orders.domain.OrderStatus;
import com.example.orders.infrastructure.persistence.OrderEntity;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface OrderPersistenceMapper {

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "orderId", source = "orderId")
    @Mapping(target = "status", source = "status")
    @Mapping(target = "cancellationReason", source = "cancellationReason")
    OrderRecord toDomain(OrderEntity entity);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "orderId", source = "orderId")
    @Mapping(target = "status", source = "status")
    @Mapping(target = "cancellationReason", source = "cancellationReason")
    OrderEntity toEntity(OrderRecord orderRecord);

    default String map(OrderStatus status) {
        return status == null ? null : status.name();
    }

    default OrderStatus map(String status) {
        return status == null ? null : OrderStatus.valueOf(status);
    }
}
