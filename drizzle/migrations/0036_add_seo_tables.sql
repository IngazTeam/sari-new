-- SEO Pages Table
CREATE TABLE IF NOT EXISTS `seo_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_slug` varchar(255) NOT NULL UNIQUE,
	`page_title` varchar(255) NOT NULL,
	`page_description` text NOT NULL,
	`keywords` text,
	`author` varchar(255),
	`canonical_url` varchar(500),
	`is_indexed` tinyint NOT NULL DEFAULT 1,
	`is_priority` tinyint NOT NULL DEFAULT 0,
	`change_frequency` enum('always','hourly','daily','weekly','monthly','yearly','never') DEFAULT 'weekly',
	`priority` varchar(3) DEFAULT '0.5',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_pages_id` PRIMARY KEY(`id`)
);

-- SEO Meta Tags Table
CREATE TABLE IF NOT EXISTS `seo_meta_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`meta_name` varchar(100) NOT NULL,
	`meta_content` text NOT NULL,
	`meta_property` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_meta_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_meta_tags_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Open Graph Table
CREATE TABLE IF NOT EXISTS `seo_open_graph` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`og_title` varchar(255) NOT NULL,
	`og_description` text NOT NULL,
	`og_image` varchar(500),
	`og_image_alt` varchar(255),
	`og_image_width` int DEFAULT 1200,
	`og_image_height` int DEFAULT 630,
	`og_type` varchar(50) DEFAULT 'website',
	`og_url` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_open_graph_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_open_graph_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Twitter Cards Table
CREATE TABLE IF NOT EXISTS `seo_twitter_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`twitter_card_type` varchar(50) DEFAULT 'summary_large_image',
	`twitter_title` varchar(255) NOT NULL,
	`twitter_description` text NOT NULL,
	`twitter_image` varchar(500),
	`twitter_image_alt` varchar(255),
	`twitter_creator` varchar(100),
	`twitter_site` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_twitter_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_twitter_cards_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Structured Data Table
CREATE TABLE IF NOT EXISTS `seo_structured_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`schema_type` varchar(100) NOT NULL,
	`schema_data` text NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_structured_data_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_structured_data_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Tracking Codes Table
CREATE TABLE IF NOT EXISTS `seo_tracking_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int,
	`tracking_type` enum('google_analytics','google_tag_manager','facebook_pixel','snapchat_pixel','tiktok_pixel','custom') NOT NULL,
	`tracking_id` varchar(255) NOT NULL,
	`tracking_code` text,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_tracking_codes_id` PRIMARY KEY(`id`)
);

-- SEO Analytics Table
CREATE TABLE IF NOT EXISTS `seo_analytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`date` timestamp NOT NULL,
	`visitors` int NOT NULL DEFAULT 0,
	`page_views` int NOT NULL DEFAULT 0,
	`bounce_rate` varchar(10) DEFAULT '0',
	`avg_session_duration` varchar(20) DEFAULT '0',
	`conversions` int NOT NULL DEFAULT 0,
	`conversion_rate` varchar(10) DEFAULT '0',
	`traffic_source` enum('organic','direct','social','referral','paid','other') DEFAULT 'organic',
	`device` enum('desktop','mobile','tablet') DEFAULT 'desktop',
	`country` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_analytics_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_analytics_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Keywords Analysis Table
CREATE TABLE IF NOT EXISTS `seo_keywords_analysis` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`keyword` varchar(255) NOT NULL,
	`search_volume` int NOT NULL DEFAULT 0,
	`difficulty` int NOT NULL DEFAULT 0,
	`current_rank` int,
	`target_rank` int DEFAULT 1,
	`competitor_count` int NOT NULL DEFAULT 0,
	`trend` varchar(50) DEFAULT 'stable',
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seo_keywords_analysis_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_keywords_analysis_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Backlinks Table
CREATE TABLE IF NOT EXISTS `seo_backlinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`source_url` varchar(500) NOT NULL,
	`source_domain` varchar(255) NOT NULL,
	`anchor_text` varchar(255),
	`link_type` enum('dofollow','nofollow') DEFAULT 'dofollow',
	`domain_authority` int DEFAULT 0,
	`spam_score` int DEFAULT 0,
	`last_found` timestamp NOT NULL DEFAULT (now()),
	`status` enum('active','lost','pending') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_backlinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_backlinks_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Performance Alerts Table
CREATE TABLE IF NOT EXISTS `seo_performance_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`alert_type` enum('ranking_drop','traffic_drop','broken_link','slow_page','low_ctr','high_bounce_rate') NOT NULL,
	`severity` enum('low','medium','high','critical') DEFAULT 'medium',
	`message` text NOT NULL,
	`metric` varchar(100),
	`previous_value` varchar(100),
	`current_value` varchar(100),
	`threshold` varchar(100),
	`is_resolved` tinyint NOT NULL DEFAULT 0,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_performance_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_performance_alerts_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Recommendations Table
CREATE TABLE IF NOT EXISTS `seo_recommendations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`page_id` int NOT NULL,
	`recommendation_type` enum('keyword_optimization','content_improvement','technical_seo','link_building','user_experience','performance') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`priority` enum('low','medium','high','critical') DEFAULT 'medium',
	`estimated_impact` varchar(100),
	`implementation_difficulty` enum('easy','medium','hard') DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','dismissed') DEFAULT 'pending',
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_recommendations_id` PRIMARY KEY(`id`),
	CONSTRAINT `seo_recommendations_page_id_fk` FOREIGN KEY (`page_id`) REFERENCES `seo_pages`(`id`) ON DELETE CASCADE
);

-- SEO Sitemaps Table
CREATE TABLE IF NOT EXISTS `seo_sitemaps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sitemap_type` enum('xml','image','video','news') NOT NULL DEFAULT 'xml',
	`url` varchar(500) NOT NULL,
	`last_modified` timestamp NOT NULL DEFAULT (now()),
	`entry_count` int NOT NULL DEFAULT 0,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seo_sitemaps_id` PRIMARY KEY(`id`)
);
