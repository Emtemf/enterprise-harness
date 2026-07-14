package com.example.orders.application;

import com.example.orders.application.dto.CancelOrderResultDto;
import com.example.orders.application.mapper.OrderCancellationApplicationMapper;
import com.example.orders.domain.OrderCancellationPolicy;
import com.example.orders.domain.OrderRecord;
import com.example.orders.domain.OrderStatus;
import com.example.orders.domain.repository.OrderRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderCancellationServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderCancellationPolicy orderCancellationPolicy;

    @Mock
    private OrderCancellationApplicationMapper orderCancellationApplicationMapper;

    @InjectMocks
    private OrderCancellationService orderCancellationService;

    /**
     * 场景：取消一个处于 CREATED 状态的订单。
     * 预期：application service 返回 application result DTO，状态变为 CANCELLED。
     * 断言：orderId、status、reason 与期望结果一致。
     */
    @DisplayName("取消可取消订单时应返回 application 层结果")
    @Test
    void should_succeed_when_canceling_a_cancellable_order() {
        OrderRecord existingOrder = new OrderRecord("order-1", OrderStatus.CREATED, null);

        OrderRecord cancelledOrder = existingOrder.cancel("duplicate request");
        CancelOrderResultDto expectedResponse = new CancelOrderResultDto("order-1", "CANCELLED", "duplicate request");

        when(orderRepository.findById("order-1")).thenReturn(Optional.of(existingOrder));
        when(orderCancellationPolicy.canCancel(OrderStatus.CREATED)).thenReturn(true);
        when(orderRepository.save(any(OrderRecord.class))).thenReturn(cancelledOrder);
        when(orderCancellationApplicationMapper.toResultDto(cancelledOrder)).thenReturn(expectedResponse);

        CancelOrderResultDto response = orderCancellationService.cancel("order-1", "duplicate request");

        assertThat(response.orderId()).isEqualTo("order-1");
        assertThat(response.status()).isEqualTo("CANCELLED");
        assertThat(response.reason()).isEqualTo("duplicate request");
    }
}
