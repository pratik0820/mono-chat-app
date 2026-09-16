package com.example.chat.file;

import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {

    /** Store the file, return the public relative URL (e.g. /files/theme/abc123.jpg). */
    String store(MultipartFile file, String subdir);

    /** Delete a previously stored file by its relative URL. No-op if missing. */
    void deleteByUrl(String relativeUrl);
}
