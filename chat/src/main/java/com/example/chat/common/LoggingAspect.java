package com.example.chat.common;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Arrays;

/**
 * Automatically logs every public method in the service layer:
 * <ul>
 *   <li>DEBUG on entry (class, method, arguments)</li>
 *   <li>DEBUG on exit (return value or duration)</li>
 *   <li>ERROR on exception (with stack trace)</li>
 * </ul>
 *
 * <p>Method-level logging is <strong>DEBUG</strong> so it only appears when the package
 * logger is at DEBUG level (see {@code logback-spring.xml} — our app defaults to DEBUG).</p>
 */
@Aspect
@Component
public class LoggingAspect {

	private static final Logger log = LoggerFactory.getLogger("com.example.chat");

	/** Matches all public methods in com.example.chat.service.* */
	@Pointcut("execution(public * com.example.chat..service..*.*(..))")
	public void serviceLayer() {}

	/** Matches all public methods in com.example.chat.*Controller */
	@Pointcut("execution(public * com.example.chat..*Controller.*(..))")
	public void controllerLayer() {}

	@Around("serviceLayer() || controllerLayer()")
	public Object logMethod(ProceedingJoinPoint joinPoint) throws Throwable {
		MethodSignature signature = (MethodSignature) joinPoint.getSignature();
		String className = signature.getDeclaringType().getSimpleName();
		String methodName = signature.getName();
		Object[] args = joinPoint.getArgs();

		log.debug("▶ {}.{}({})", className, methodName, formatArgs(args));

		long start = System.currentTimeMillis();
		try {
			Object result = joinPoint.proceed();
			long duration = System.currentTimeMillis() - start;
			log.debug("◀ {}.{} returned in {}ms{}", className, methodName, duration,
					result == null ? " (void)" : " → " + truncate(result.toString(), 200));
			return result;
		} catch (Throwable ex) {
			long duration = System.currentTimeMillis() - start;
			log.error("✖ {}.{} failed after {}ms — {}: {}",
					className, methodName, duration, ex.getClass().getSimpleName(), ex.getMessage());
			throw ex;
		}
	}

	/**
	 * Formats method arguments for logging, masking sensitive values.
	 */
	private String formatArgs(Object[] args) {
		if (args == null || args.length == 0) return "";
		return Arrays.stream(args)
				.map(this::maskArg)
				.reduce((a, b) -> a + ", ")
				.orElse("");
	}

	private String maskArg(Object arg) {
		if (arg == null) return "null";
		String str = arg.toString();
		// Mask strings that look like passwords/tokens
		String lower = str.toLowerCase();
		if (lower.contains("password") || lower.contains("secret") || lower.contains("token")) {
			return "[REDACTED]";
		}
		return truncate(str, 100);
	}

	private String truncate(String s, int max) {
		if (s == null) return "null";
		return s.length() <= max ? s : s.substring(0, max) + "...";
	}
}
