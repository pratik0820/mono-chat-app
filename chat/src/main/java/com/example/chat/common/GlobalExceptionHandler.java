package com.example.chat.common;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Converts exceptions into a consistent JSON error body:
 * {"status": 400, "error": "Bad Request", "message": "..."}
 * The mobile app reads {@code message} to display user-facing errors.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	@ExceptionHandler(ResponseStatusException.class)
	public ResponseEntity<Map<String, Object>> handleResponseStatus(ResponseStatusException ex) {
		return body(ex.getStatusCode().value(), ex.getReason());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
		String message = ex.getBindingResult().getFieldErrors().stream()
				.findFirst()
				.map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
				.orElse("Validation failed");
		return body(HttpStatus.BAD_REQUEST.value(), message);
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
		org.slf4j.LoggerFactory.getLogger("com.example.chat")
				.error("Unhandled exception: {}", ex.getMessage(), ex);
		return body(HttpStatus.INTERNAL_SERVER_ERROR.value(), "Internal server error");
	}

	private static ResponseEntity<Map<String, Object>> body(int status, String message) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("status", status);
		body.put("error", HttpStatus.valueOf(status).getReasonPhrase());
		body.put("message", message != null ? message : HttpStatus.valueOf(status).getReasonPhrase());
		return ResponseEntity.status(status).body(body);
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ResponseEntity<Map<String, Object>> handleMaxUpload(MaxUploadSizeExceededException ex) {
		return body(HttpStatus.PAYLOAD_TOO_LARGE.value(), "Image too large — max 5MB");
	}
}
