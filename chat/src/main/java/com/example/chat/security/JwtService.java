package com.example.chat.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Date;

@Service
public class JwtService {

	private static final String BLACKLIST_PREFIX = "jwt:blacklist:";

	private final SecretKey key;
	private final long expirationMs;
	private final StringRedisTemplate redisTemplate;

	public JwtService(@Value("${jwt.secret}") String secret,
			@Value("${jwt.expiration-ms:86400000}") long expirationMs,
			StringRedisTemplate redisTemplate) {
		this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
		this.expirationMs = expirationMs;
		this.redisTemplate = redisTemplate;
	}

	public String generateToken(String username) {
		Date now = new Date();
		return Jwts.builder()
				.subject(username)
				.issuedAt(now)
				.expiration(new Date(now.getTime() + expirationMs))
				.signWith(key)
				.compact();
	}

	public String parseUsername(String token) {
		Claims claims = Jwts.parser()
				.verifyWith(key)
				.build()
				.parseSignedClaims(token)
				.getPayload();
		return claims.getSubject();
	}

	public void blacklistToken(String token) {
		try {
			long remainingMs = parseExpiration(token) - System.currentTimeMillis();
			if (remainingMs > 0) {
				redisTemplate.opsForValue().set(
						BLACKLIST_PREFIX + token, "1", Duration.ofMillis(remainingMs));
			}
		} catch (Exception ignored) {
			// token already expired, nothing to blacklist
		}
	}

	public boolean isTokenBlacklisted(String token) {
		try {
			return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
		} catch (Exception e) {
			// Redis unavailable — treat token as not blacklisted
			return false;
		}
	}

	private long parseExpiration(String token) {
		Claims claims = Jwts.parser()
				.verifyWith(key).build()
				.parseSignedClaims(token).getPayload();
		return claims.getExpiration().getTime();
	}
}
