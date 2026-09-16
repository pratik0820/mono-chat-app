package com.example.chat.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves uploaded theme images at /files/** straight from the local
 * uploads directory. URLs are relative (/files/theme/x.jpg) so switching
 * storage vendors later only changes this class (docs §10 "URL rot").
 */
@Configuration
public class FileServingConfig implements WebMvcConfigurer {

    private final String dir;

    public FileServingConfig(@Value("${chat.uploads.dir:uploads}") String dir) {
        this.dir = dir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/files/**")
                .addResourceLocations("file:" + (dir.endsWith("/") || dir.endsWith("\\") ? dir : dir + "/"))
                .setCachePeriod(3600);
    }
}
