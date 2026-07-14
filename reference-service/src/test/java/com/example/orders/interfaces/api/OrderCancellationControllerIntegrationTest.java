package com.example.orders.interfaces.api;

import com.example.orders.infrastructure.persistence.OrderEntity;
import com.example.orders.infrastructure.persistence.OrderJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class OrderCancellationControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private OrderJpaRepository orderJpaRepository;

    @BeforeEach
    void setUp() {
        orderJpaRepository.deleteAll();
        orderJpaRepository.save(new OrderEntity("order-1", "CREATED", null));
    }

    /**
     * 场景：通过 HTTP 端点取消一个处于 CREATED 状态的订单。
     * 预期：接口仍返回既有 response 语义，状态为 CANCELLED，reason 与请求一致。
     * 断言：HTTP 200，且 JSON response 中的 orderId、status、reason 正确。
     */
    @DisplayName("通过取消订单接口时应保持既有 HTTP 响应语义")
    @Test
    void should_succeed_when_canceling_an_order_through_the_http_endpoint() throws Exception {
        mockMvc.perform(post("/api/orders/{orderId}/cancel", "order-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  \"reason\": \"duplicate request\"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderId").value("order-1"))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.reason").value("duplicate request"));
    }

    /**
     * 场景：取消一个不存在的订单。
     * 预期：接口返回 404，并返回稳定错误响应模型。
     * 断言：status 为 404，error 字段可见。
     */
    @DisplayName("取消不存在订单时应返回 404 错误响应")
    @Test
    void should_fail_when_canceling_a_missing_order() throws Exception {
        mockMvc.perform(post("/api/orders/{orderId}/cancel", "missing-order")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  \"reason\": \"duplicate request\"
                                }
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("order not found"));
    }

    /**
     * 场景：取消一个不允许取消状态的订单。
     * 预期：接口返回 409，并返回稳定错误响应模型。
     * 断言：status 为 409，error 字段可见。
     */
    @DisplayName("取消不可取消状态订单时应返回 409 错误响应")
    @Test
    void should_fail_when_canceling_an_order_in_a_non_cancellable_status() throws Exception {
        orderJpaRepository.deleteAll();
        orderJpaRepository.save(new OrderEntity("order-2", "SHIPPED", null));

        mockMvc.perform(post("/api/orders/{orderId}/cancel", "order-2")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  \"reason\": \"duplicate request\"
                                }
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("order cannot be cancelled"));
    }

    /**
     * 场景：取消订单请求中的 reason 为空白。
     * 预期：接口返回 400，并返回稳定错误响应模型。
     * 断言：status 为 400，error 字段可见。
     */
    @DisplayName("取消订单请求不合法时应返回 400 错误响应")
    @Test
    void should_fail_when_canceling_an_order_with_blank_reason() throws Exception {
        mockMvc.perform(post("/api/orders/{orderId}/cancel", "order-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  \"reason\": \"\"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("reason is required"));
    }

    /**
     * 场景：取消订单请求中的 JSON 非法。
     * 预期：接口返回 400，并返回稳定错误响应模型。
     * 断言：status 为 400，error 字段可见。
     */
    @DisplayName("取消订单请求体非法时应返回 400 错误响应")
    @Test
    void should_fail_when_canceling_an_order_with_malformed_json() throws Exception {
        mockMvc.perform(post("/api/orders/{orderId}/cancel", "order-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("request body is invalid"));
    }
}
