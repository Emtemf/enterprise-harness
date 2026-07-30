package example;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.Test;

class GreetingServiceTest {
    @Test
    void greetsByName() throws Exception {
        Class<?> type = Class.forName("example.GreetingService");
        Object service = type.getConstructor().newInstance();
        Method greet = type.getMethod("greet", String.class);
        assertThat(greet.invoke(service, "Harness")).isEqualTo("Hello, Harness");
    }
}
