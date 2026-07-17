package com.example.orders.interfaces.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.yaml.snakeyaml.Yaml;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderCancellationOpenApiSemanticTest {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate testRestTemplate;

    /**
     * 场景：对比 owned YAML 与 live /v3/api-docs 中 cancel-order 的关键语义。
     * 预期：path/method/operationId/request/response/error contract 以及 reason non-blank 语义都保持一致。
     * 断言：owned YAML 与 live docs 的关键字段逐项一致。
     */
    @Test
    @DisplayName("live docs 应与 owned YAML 对齐 cancel-order 的关键语义")
    @SuppressWarnings("unchecked")
    void should_match_owned_yaml_for_cancel_order_semantics() throws Exception {
        Yaml yaml = new Yaml();
        Map<String, Object> owned = yaml.load(Files.newInputStream(Path.of("openapi", "order-service.yaml")));

        Map<String, Object> liveDocs = testRestTemplate.getForObject(
                "http://localhost:" + port + "/v3/api-docs",
                Map.class
        );

        assertThat(owned).isNotNull();
        assertThat(liveDocs).isNotNull();

        Map<String, Object> ownedPaths = (Map<String, Object>) owned.get("paths");
        Map<String, Object> ownedCancelPath = (Map<String, Object>) ownedPaths.get("/api/orders/{orderId}/cancel");
        Map<String, Object> ownedPost = (Map<String, Object>) ownedCancelPath.get("post");
        Map<String, Object> ownedRequestBody = (Map<String, Object>) ownedPost.get("requestBody");
        Map<String, Object> ownedRequestContent = (Map<String, Object>) ownedRequestBody.get("content");
        Map<String, Object> ownedRequestJson = (Map<String, Object>) ownedRequestContent.get("application/json");
        Map<String, Object> ownedRequestSchemaRef = (Map<String, Object>) ownedRequestJson.get("schema");
        Map<String, Object> ownedResponses = (Map<String, Object>) ownedPost.get("responses");

        Map<String, Object> livePaths = (Map<String, Object>) liveDocs.get("paths");
        Map<String, Object> liveCancelPath = (Map<String, Object>) livePaths.get("/api/orders/{orderId}/cancel");
        Map<String, Object> livePost = (Map<String, Object>) liveCancelPath.get("post");
        Map<String, Object> liveRequestBody = (Map<String, Object>) livePost.get("requestBody");
        Map<String, Object> liveRequestContent = (Map<String, Object>) liveRequestBody.get("content");
        Map<String, Object> liveRequestJson = (Map<String, Object>) liveRequestContent.get("application/json");
        Map<String, Object> liveRequestSchemaRef = (Map<String, Object>) liveRequestJson.get("schema");
        Map<String, Object> liveResponses = (Map<String, Object>) livePost.get("responses");

        assertThat(livePost.get("operationId")).isEqualTo(ownedPost.get("operationId"));
        assertThat(liveRequestSchemaRef.get("$ref")).isEqualTo(ownedRequestSchemaRef.get("$ref"));

        for (String status : new String[]{"200", "400", "404", "409"}) {
            Map<String, Object> ownedResponse = (Map<String, Object>) ownedResponses.get(status);
            Map<String, Object> liveResponse = (Map<String, Object>) liveResponses.get(status);
            Map<String, Object> ownedContent = (Map<String, Object>) ownedResponse.get("content");
            Map<String, Object> ownedJson = (Map<String, Object>) ownedContent.get("application/json");
            Map<String, Object> ownedSchema = (Map<String, Object>) ownedJson.get("schema");
            Map<String, Object> liveContent = (Map<String, Object>) liveResponse.get("content");
            Map<String, Object> liveJson = (Map<String, Object>) liveContent.get("application/json");
            Map<String, Object> liveSchema = (Map<String, Object>) liveJson.get("schema");

            assertThat(liveResponse.get("description")).isEqualTo(ownedResponse.get("description"));
            assertThat(liveSchema.get("$ref")).isEqualTo(ownedSchema.get("$ref"));
        }

        Map<String, Object> ownedSchemas = (Map<String, Object>) ((Map<String, Object>) owned.get("components")).get("schemas");
        Map<String, Object> ownedRequest = (Map<String, Object>) ownedSchemas.get("CancelOrderRequest");
        Map<String, Object> ownedRequestProperties = (Map<String, Object>) ownedRequest.get("properties");
        Map<String, Object> ownedReason = (Map<String, Object>) ownedRequestProperties.get("reason");
        assertThat(ownedRequest.get("required")).asList().contains("reason");

        Map<String, Object> liveSchemas = (Map<String, Object>) ((Map<String, Object>) liveDocs.get("components")).get("schemas");
        Map<String, Object> liveRequest = (Map<String, Object>) liveSchemas.get("CancelOrderRequest");
        Map<String, Object> liveRequestProperties = (Map<String, Object>) liveRequest.get("properties");
        Map<String, Object> liveReason = (Map<String, Object>) liveRequestProperties.get("reason");
        assertThat(liveRequest.get("required")).asList().contains("reason");

        String ownedPattern = String.valueOf(ownedReason.get("pattern")).replace("\\\\", "\\");
        String livePattern = String.valueOf(liveReason.get("pattern")).replace("\\\\", "\\");

        assertThat(liveReason.get("description")).isEqualTo(ownedReason.get("description"));
        assertThat(livePattern).isEqualTo(ownedPattern);
        assertThat(liveReason.get("minLength")).isEqualTo(ownedReason.get("minLength"));

        Map<String, Object> liveResponseSchema = (Map<String, Object>) liveSchemas.get("CancelOrderResponse");
        assertThat(liveResponseSchema.get("required")).asList().contains("orderId", "status", "reason");

        Map<String, Object> liveErrorSchema = (Map<String, Object>) liveSchemas.get("ApiErrorResponse");
        assertThat(liveErrorSchema.get("required")).asList().contains("error");
    }
}
