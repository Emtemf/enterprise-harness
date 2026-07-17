package com.example.orders.interfaces.api;

import com.example.orders.interfaces.api.dto.CancelOrderResponse;
import com.example.orders.infrastructure.persistence.OrderEntity;
import com.example.orders.infrastructure.persistence.OrderJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.RequestEntity;
import org.springframework.http.ResponseEntity;

import java.net.URI;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderCancellationControllerHttpE2ETest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate testRestTemplate;

    @Autowired
    private OrderJpaRepository orderJpaRepository;

    @BeforeEach
    void setUp() {
        orderJpaRepository.deleteAll();
        orderJpaRepository.save(new OrderEntity("order-1", "CREATED", null));
    }

    /**
     * 场景：通过真实随机端口 HTTP 请求取消订单，并验证持久化最终状态。
     * 预期：返回 200，且数据库中的订单状态变为 CANCELLED。
     * 断言：response body 与持久化状态都符合预期。
     */
    @DisplayName("真实 HTTP 请求取消订单后应更新持久化最终状态")
    @Test
    void should_succeed_when_canceling_an_order_through_real_http_and_persist_final_state() {
        RequestEntity<Map<String, String>> request = RequestEntity
                .post(URI.create("http://localhost:" + port + "/api/orders/order-1/cancel"))
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("reason", "duplicate request"));

        ResponseEntity<CancelOrderResponse> response = testRestTemplate.exchange(request, CancelOrderResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().orderId()).isEqualTo("order-1");
        assertThat(response.getBody().status()).isEqualTo("CANCELLED");
        assertThat(response.getBody().reason()).isEqualTo("duplicate request");

        OrderEntity saved = orderJpaRepository.findById("order-1").orElseThrow();
        assertThat(saved.getStatus()).isEqualTo("CANCELLED");
        assertThat(saved.getCancellationReason()).isEqualTo("duplicate request");
    }

    /**
     * 场景：读取 live /v3/api-docs，并要求 cancel-order operation 显式暴露 error response 语义。
     * 预期：`400` / `404` / `409` 均存在，且 schema 指向 `ApiErrorResponse`。
     * 断言：OpenAPI JSON 中的关键路径与 response schema 引用可见。
     */
    @DisplayName("live OpenAPI 文档应显式暴露 cancel-order 的错误响应语义")
    @Test
    @SuppressWarnings("unchecked")
    void should_expose_error_response_semantics_in_live_openapi_docs() {
        Map<String, Object> docs = testRestTemplate.getForObject(
                "http://localhost:" + port + "/v3/api-docs",
                Map.class
        );

        assertThat(docs).isNotNull();
        Map<String, Object> paths = (Map<String, Object>) docs.get("paths");
        Map<String, Object> cancelPath = (Map<String, Object>) paths.get("/api/orders/{orderId}/cancel");
        Map<String, Object> post = (Map<String, Object>) cancelPath.get("post");
        Map<String, Object> responses = (Map<String, Object>) post.get("responses");

        for (String status : new String[]{"400", "404", "409"}) {
            assertThat(responses).containsKey(status);
            Map<String, Object> response = (Map<String, Object>) responses.get(status);
            Map<String, Object> content = (Map<String, Object>) response.get("content");
            Map<String, Object> json = (Map<String, Object>) content.get("application/json");
            Map<String, Object> schema = (Map<String, Object>) json.get("schema");
            assertThat(schema.get("$ref")).isEqualTo("#/components/schemas/ApiErrorResponse");
        }
    }
}
