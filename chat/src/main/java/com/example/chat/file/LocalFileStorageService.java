package com.example.chat.file;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * Stores theme images on the local disk under chat.uploads.dir
 * (default "uploads", relative to the working directory).
 * <p>
 * Security: extension whitelist, image/* content-type check, 5 MB cap is
 * enforced in ThemeService, and every path is normalized + checked to stay
 * inside the root (path-traversal guard).
 */
@Service
public class LocalFileStorageService implements FileStorageService {

    private final Path root;

    public LocalFileStorageService(@Value("${chat.uploads.dir:uploads}") String dir) throws IOException {
        this.root = Paths.get(dir).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    @Override
    public String store(MultipartFile file, String subdir) {
        String ext = extensionOf(file);
        if (!ext.matches("\\.(jpg|jpeg|png|webp)")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Only JPG, PNG or WebP images are allowed");
        }

        String contentType = file.getContentType();
        if (contentType != null && !contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Not an image file");
        }

        String safeSub = (subdir == null ? "" : subdir).replaceAll("[^a-zA-Z0-9_-]", "");
        String key = (safeSub.isEmpty() ? "" : safeSub + "/") + UUID.randomUUID() + ext;

        try {
            Path target = root.resolve(key).normalize();
            if (!target.startsWith(root)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bad Path");
            }
            Files.createDirectories(target.getParent());
            file.transferTo(target);
            return "/files/" + key;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to store file", e);
        }
    }

    @Override
    public void deleteByUrl(String relativeUrl) {
        if (relativeUrl == null || !relativeUrl.startsWith("/files/")) return;
        try {
            Path p = root.resolve(relativeUrl.substring("/files/".length())).normalize();
            if (p.startsWith(root)) {
                Files.deleteIfExists(p);
            }
        } catch (IOException ignored) {
            // best-effort cleanup; a leftover file must not fail the request
        }
    }

    private static String extensionOf(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null) return "";
        int dot = name.lastIndexOf('.');
        return dot == -1 ? "" : name.substring(dot).toLowerCase();
    }
}
