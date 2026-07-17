package com.example.orders.domain;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

class OrderCancellationPolicyArchitectureTest {

    private static final JavaClasses IMPORTED_CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.example.orders");

    /**
     * 场景：domain 与 domain.repository 不应依赖 framework 或外层实现细节。
     * 预期：domain 代码不依赖 Spring、JPA、Servlet、interfaces、application、infrastructure。
     * 断言：对应 ArchUnit 规则通过。
     */
    @DisplayName("domain 应保持框架无关且不依赖外层实现")
    @Test
    void should_not_depend_on_framework_or_outer_layers_when_domain_is_pure() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..domain..").or().resideInAPackage("..domain.repository..")
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "org.springframework..",
                        "jakarta.persistence..",
                        "jakarta.servlet..",
                        "..interfaces..",
                        "..application..",
                        "..infrastructure.."
                );

        rule.check(IMPORTED_CLASSES);
    }

    /**
     * 场景：application 层不应依赖 interfaces 或 infrastructure。
     * 预期：application 只面向 domain inward dependencies。
     * 断言：对应 ArchUnit 规则通过。
     */
    @DisplayName("application 不应依赖 interfaces 或 infrastructure")
    @Test
    void should_not_depend_on_interfaces_or_infrastructure_when_application_is_inward() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..application..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("..interfaces..", "..infrastructure..");

        rule.check(IMPORTED_CLASSES);
    }

    /**
     * 场景：interfaces 层不应直接依赖 domain internals 或 infrastructure。
     * 预期：interfaces 只通过 application use case 暴露能力。
     * 断言：对应 ArchUnit 规则通过。
     */
    @DisplayName("interfaces 不应直接依赖 domain 或 infrastructure")
    @Test
    void should_not_depend_on_domain_or_infrastructure_when_interfaces_are_transport_only() {
        ArchRule rule = noClasses()
                .that().resideInAPackage("..interfaces..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("..domain..", "..infrastructure..");

        rule.check(IMPORTED_CLASSES);
    }
}
