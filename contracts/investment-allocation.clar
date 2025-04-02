;; investment-allocation.clar
;; Manages distribution across asset classes

;; Define data structures
(define-map asset-classes
  { id: uint }
  {
    name: (string-ascii 64),
    allocation-percentage: uint,
    current-value: uint
  }
)

(define-data-var asset-class-counter uint u0)
(define-data-var total-fund-value uint u0)

;; Contract owner
(define-constant contract-owner tx-sender)

;; Error codes
(define-constant err-unauthorized (err u100))
(define-constant err-invalid-percentage (err u101))
(define-constant err-asset-class-not-found (err u102))

;; Authorization check
(define-private (is-contract-owner)
  (is-eq tx-sender contract-owner)
)

;; Public functions
(define-public (add-asset-class (name (string-ascii 64)) (allocation-percentage uint))
  (begin
    ;; Only contract owner can add asset classes
    (asserts! (is-contract-owner) err-unauthorized)
    ;; Percentage must be between 0 and 100
    (asserts! (<= allocation-percentage u100) err-invalid-percentage)

    (let
      ((new-id (var-get asset-class-counter)))
      (begin
        (map-set asset-classes
          { id: new-id }
          {
            name: name,
            allocation-percentage: allocation-percentage,
            current-value: u0
          }
        )
        (var-set asset-class-counter (+ new-id u1))
        (ok new-id)
      )
    )
  )
)

(define-public (update-asset-allocation (id uint) (allocation-percentage uint))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (asserts! (<= allocation-percentage u100) err-invalid-percentage)
    (asserts! (is-some (map-get? asset-classes { id: id })) err-asset-class-not-found)

    (let
      ((asset-class (unwrap-panic (map-get? asset-classes { id: id }))))
      (begin
        (map-set asset-classes
          { id: id }
          (merge asset-class { allocation-percentage: allocation-percentage })
        )
        (ok true)
      )
    )
  )
)

(define-public (update-asset-value (id uint) (new-value uint))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (asserts! (is-some (map-get? asset-classes { id: id })) err-asset-class-not-found)

    (let
      ((asset-class (unwrap-panic (map-get? asset-classes { id: id }))))
      (begin
        (map-set asset-classes
          { id: id }
          (merge asset-class { current-value: new-value })
        )
        (ok true)
      )
    )
  )
)

(define-public (update-total-fund-value (new-value uint))
  (begin
    (asserts! (is-contract-owner) err-unauthorized)
    (var-set total-fund-value new-value)
    (ok true)
  )
)

;; Read-only functions
(define-read-only (get-asset-class (id uint))
  (map-get? asset-classes { id: id })
)

(define-read-only (get-asset-class-count)
  (var-get asset-class-counter)
)

(define-read-only (get-total-fund-value)
  (var-get total-fund-value)
)
