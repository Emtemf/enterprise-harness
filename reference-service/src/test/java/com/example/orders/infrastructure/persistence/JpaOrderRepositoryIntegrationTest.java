package com.example.orders.infrastructure.persistence;

import com.example.orders.domain.OrderRecord;
import com.example.orders.domain.OrderStatus;
import com.example.orders.infrastructure.persistence.mapper.OrderPersistenceMapperImpl;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@Import({JpaOrderRepository.class, OrderPersistenceMapperImpl.class})
class JpaOrderRepositoryIntegrationTest {

    @Autowired
    private JpaOrderRepository jpaOrderRepository;

    /**
     * 场景：检查 JPA adapter 是否直接实现 domain repository port。
     * 预期：当前 adapter 的直接接口集合中包含 domain repository port。
     * 断言：`JpaOrderRepository.class.getInterfaces()` 包含 domain port。
     */
    @DisplayName("持久化适配器应直接实现 domain repository port")
    @Test
    void should_implement_domain_repository_port_directly_when_adapter_is_boundary_aligned() {
        assertThat(Arrays.asList(JpaOrderRepository.class.getInterfaces()))
                .contains(com.example.orders.domain.repository.OrderRepository.class);
    }

    /**
     * 场景：通过 repository adapter 保存并重新加载订单。
     * 预期：adapter 能正确完成 save / findById，并保持领域对象语义。
     * 断言：保存后的 orderId 正确，findById 返回与期望一致的领域对象。
     */
    @DisplayName("持久化适配器应保持保存与读取的领域语义")
    @Test
    void should_succeed_when_loading_and_saving_order_through_repository_adapter() {
        OrderRecord saved = jpaOrderRepository.save(new OrderRecord("order-2", OrderStatus.CREATED, null));

        assertThat(saved.orderId()).isEqualTo("order-2");
        assertThat(jpaOrderRepository.findById("order-2"))
                .contains(new OrderRecord("order-2", OrderStatus.CREATED, null));
    }
}
