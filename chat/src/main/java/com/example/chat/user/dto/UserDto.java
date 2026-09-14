package com.example.chat.user.dto;

import com.example.chat.user.User;

import java.time.Instant;

public record UserDto(Long id, String username, String email, Instant createdAt) {

	public static UserDto from(User user) {
		return new UserDto(user.getId(), user.getUsername(), user.getEmail(), user.getCreatedAt());
	}
}
