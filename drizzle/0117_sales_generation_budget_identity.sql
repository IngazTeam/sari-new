ALTER TABLE `ai_sales_experiment_generations`
  ADD COLUMN `expected_reservation_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY `uq_sales_generation_expected_reservation` (`expected_reservation_key`);
