ALTER TABLE public.centering_measurements
  DROP CONSTRAINT IF EXISTS centering_measurements_psa_ceiling_check;

ALTER TABLE public.centering_measurements
  ADD CONSTRAINT centering_measurements_psa_ceiling_check
  CHECK (
    psa_ceiling IN (
      'PSA_10',
      'PSA_9',
      'PSA_8',
      'PSA_7',
      'PSA_6',
      'PSA_5',
      'PSA_4',
      'PSA_3_OR_LESS',
      'PSA_2_OR_LESS',
      'BELOW_PSA_7'
    )
  );
