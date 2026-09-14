package com.example.chat.user;

import com.example.chat.security.JwtService;
import com.example.chat.user.dto.AuthResponse;
import com.example.chat.user.dto.LoginRequest;
import com.example.chat.user.dto.RegisterRequest;
import com.example.chat.user.dto.UserDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);

	private final UserRepository userRepository;
	private final PasswordEncoder passwordEncoder;
	private final JwtService jwtService;

	public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
		this.userRepository = userRepository;
		this.passwordEncoder = passwordEncoder;
		this.jwtService = jwtService;
	}

	public AuthResponse register(RegisterRequest request) {
		log.info("Register attempt: username={}", request.username());
		if (userRepository.existsByUsername(request.username())) {
			log.warn("Register rejected: username '{}' already taken", request.username());
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username already taken");
		}
		if (userRepository.existsByEmail(request.email())) {
			log.warn("Register rejected: email '{}' already registered", request.email());
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email already registered");
		}

		User user = new User();
		user.setUsername(request.username());
		user.setEmail(request.email());
		user.setPasswordHash(passwordEncoder.encode(request.password()));
		userRepository.save(user);
		log.info("Registered user: {} (id={})", user.getUsername(), user.getId());

		return new AuthResponse(jwtService.generateToken(user.getUsername()), UserDto.from(user));
	}

	public AuthResponse login(LoginRequest request) {
		log.info("Login attempt: username={}", request.username());
		User user = userRepository.findByUsername(request.username())
				.orElseThrow(() -> {
					log.warn("Login rejected: username '{}' not found", request.username());
					return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
				});

		if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
			log.warn("Login rejected: wrong password for '{}'", request.username());
			throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid username or password");
		}

		log.info("Login successful: {} (id={})", user.getUsername(), user.getId());
		return new AuthResponse(jwtService.generateToken(user.getUsername()), UserDto.from(user));
	}
}
