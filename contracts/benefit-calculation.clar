;; benefit-calculation.clar
;; Determines payments to retirees

;; Define data structures
(define-map retiree-benefits
  { user: principal }
  {
    years-of-service: uint,
    final-average-salary: uint,
    benefit-factor: uint,
    monthly-benefit: uint,
    retirement-date: uint,
    is-active: bool
  }
)

(define-map benefit-payments
  { user: principal, payment-id: uint }
  {
    amount: uint,
    payment-date: uint
  }
)

(define-map user-payment-counters
  { user: principal }
  { counter: uint }
)

;; Contract owner
(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-unauthorized (err u100))
(define-constant err-retiree-not-found (err u101))
(define-constant err-already-retired (err u102))
(define-constant err-invalid-parameters (err u103))

;; Authorization check
(define-private (is-contract-owner)
  (is-eq tx-sender contract-owner)
)

;; Public functions
(define-public (register-retiree (user principal) (years-of-service uint) (final-average-salary uint) (benefit-factor uint))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (asserts! (> years-of-service u0) err-invalid-parameters)
    (asserts! (> final-average-salary u0) err-invalid-parameters)
    (asserts! (> benefit-factor u0) err-invalid-parameters)
    (asserts! (is-none (map-get? retiree-benefits { user: user })) err-already-retired)

    (let
      (
        (current-time (unwrap-panic (get-block-info? time u0)))
        ;; Calculate monthly benefit: (years * final-avg-salary * factor) / 10000
        ;; benefit-factor is expressed as basis points (e.g., 200 = 2%)
        (monthly-benefit (/ (* (* years-of-service final-average-salary) benefit-factor) u10000))
      )
      (begin
        (map-set retiree-benefits
          { user: user }
          {
            years-of-service: years-of-service,
            final-average-salary: final-average-salary,
            benefit-factor: benefit-factor,
            monthly-benefit: monthly-benefit,
            retirement-date: current-time,
            is-active: true
          }
        )

        (map-set user-payment-counters
          { user: user }
          { counter: u0 }
        )

        (ok monthly-benefit)
      )
    )
  )
)

(define-public (update-retiree-status (user principal) (is-active bool))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (asserts! (is-some (map-get? retiree-benefits { user: user })) err-retiree-not-found)

    (let
      ((retiree (unwrap-panic (map-get? retiree-benefits { user: user }))))
      (begin
        (map-set retiree-benefits
          { user: user }
          (merge retiree { is-active: is-active })
        )
        (ok true)
      )
    )
  )
)

(define-public (record-benefit-payment (user principal) (amount uint))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (asserts! (is-some (map-get? retiree-benefits { user: user })) err-retiree-not-found)

    (let
      (
        (retiree (unwrap-panic (map-get? retiree-benefits { user: user })))
        (current-time (unwrap-panic (get-block-info? time u0)))
        (counter-data (default-to { counter: u0 } (map-get? user-payment-counters { user: user })))
        (payment-id (get counter counter-data))
      )
      (begin
        ;; Only allow payments for active retirees
        (asserts! (get is-active retiree) err-invalid-parameters)

        (map-set benefit-payments
          { user: user, payment-id: payment-id }
          {
            amount: amount,
            payment-date: current-time
          }
        )

        (map-set user-payment-counters
          { user: user }
          { counter: (+ payment-id u1) }
        )

        (ok payment-id)
      )
    )
  )
)

;; Read-only functions
(define-read-only (get-retiree-benefits (user principal))
  (map-get? retiree-benefits { user: user })
)

(define-read-only (get-benefit-payment (user principal) (payment-id uint))
  (map-get? benefit-payments { user: user, payment-id: payment-id })
)

(define-read-only (get-payment-count (user principal))
  (default-to { counter: u0 } (map-get? user-payment-counters { user: user }))
)

(define-read-only (calculate-total-payments (user principal))
  (let
    (
      (payment-count (get counter (default-to { counter: u0 } (map-get? user-payment-counters { user: user }))))
      (total-payments u0)
    )
    (fold calculate-payment-sum (list u0 u1 u2 u3 u4 u5 u6 u7 u8 u9) { user: user, count: payment-count, total: u0 })
  )
)

(define-private (calculate-payment-sum (index uint) (state { user: principal, count: uint, total: uint }))
  (let
    (
      (user (get user state))
      (count (get count state))
      (total (get total state))
      (payment-id (+ (* index u10) (- count u10)))
    )
    (if (>= payment-id count)
      state
      (let
        (
          (payment (default-to { amount: u0 } (map-get? benefit-payments { user: user, payment-id: payment-id })))
          (amount (get amount payment))
        )
        { user: user, count: count, total: (+ total amount) }
      )
    )
  )
)
