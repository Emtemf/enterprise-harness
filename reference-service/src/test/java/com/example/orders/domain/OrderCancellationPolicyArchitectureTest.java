package com.example.orders.domain;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.stereotype.Component;

import static org.assertj.core.api.Assertions.assertThat;

class OrderCancellationPolicyArchitectureTest {

    /**
     * 场景：检查 domain policy 是否仍依赖 Spring stereotype 注解。
     * 预期：纯 domain policy 不应标注 `@Component`。
     * 断言：`OrderCancellationPolicy` 上不存在 `@Component`。
     */
    @DisplayName("领域策略应保持框架无关")
    @Test
    void should_not_depend_on_spring_component_annotation_when_domain_policy_is_pure() {
        assertThat(OrderCancellationPolicy.class.isAnnotationPresent(Component.class)).isFalse();
    }
}
