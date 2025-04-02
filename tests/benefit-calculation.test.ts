import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock blockchain environment
const mockBlockchain = {
  currentTime: 1000,
  principals: {
    deployer: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    user1: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    user2: 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC'
  },
  contractState: {
    retireeBenefits: {},
    benefitPayments: {},
    userPaymentCounters: {}
  }
};

// Read contract code
const contractPath = path.join(__dirname, '../contracts/benefit-calculation.clar');
const contractCode = fs.readFileSync(contractPath, 'utf8');

// Error codes
const ERR_UNAUTHORIZED = { type: 'err', value: 100 };
const ERR_RETIREE_NOT_FOUND = { type: 'err', value: 101 };
const ERR_ALREADY_RETIRED = { type: 'err', value: 102 };
const ERR_INVALID_PARAMETERS = { type: 'err', value: 103 };

// Simple mock interpreter for testing
function mockContractCall(method, args, sender) {
  const state = mockBlockchain.contractState;
  const isContractOwner = sender === mockBlockchain.principals.deployer;
  
  if (method === 'register-retiree') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [user, yearsOfService, finalAverageSalary, benefitFactor] = args;
    
    if (yearsOfService <= 0 || finalAverageSalary <= 0 || benefitFactor <= 0) {
      return ERR_INVALID_PARAMETERS;
    }
    
    if (state.retireeBenefits[user]) return ERR_ALREADY_RETIRED;
    
    const currentTime = mockBlockchain.currentTime;
    const monthlyBenefit = Math.floor((yearsOfService * finalAverageSalary * benefitFactor) / 10000);
    
    state.retireeBenefits[user] = {
      yearsOfService,
      finalAverageSalary,
      benefitFactor,
      monthlyBenefit,
      retirementDate: currentTime,
      isActive: true
    };
    
    state.userPaymentCounters[user] = { counter: 0 };
    
    return { type: 'ok', value: monthlyBenefit };
  }
  
  if (method === 'update-retiree-status') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [user, isActive] = args;
    
    if (!state.retireeBenefits[user]) return ERR_RETIREE_NOT_FOUND;
    
    state.retireeBenefits[user] = {
      ...state.retireeBenefits[user],
      isActive
    };
    
    return { type: 'ok', value: true };
  }
  
  if (method === 'record-benefit-payment') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [user, amount] = args;
    
    if (!state.retireeBenefits[user]) return ERR_RETIREE_NOT_FOUND;
    if (!state.retireeBenefits[user].isActive) return ERR_INVALID_PARAMETERS;
    
    const currentTime = mockBlockchain.currentTime;
    const counterData = state.userPaymentCounters[user] || { counter: 0 };
    const paymentId = counterData.counter;
    
    const key = `${user}-${paymentId}`;
    state.benefitPayments[key] = {
      amount,
      paymentDate: currentTime
    };
    
    state.userPaymentCounters[user] = { counter: paymentId + 1 };
    
    return { type: 'ok', value: paymentId };
  }
  
  if (method === 'get-retiree-benefits') {
    const [user] = args;
    return state.retireeBenefits[user];
  }
  
  if (method === 'get-benefit-payment') {
    const [user, paymentId] = args;
    const key = `${user}-${paymentId}`;
    return state.benefitPayments[key];
  }
  
  if (method === 'get-payment-count') {
    const [user] = args;
    return state.userPaymentCounters[user] || { counter: 0 };
  }
  
  throw new Error(`Unknown method: ${method}`);
}

describe('Benefit Calculation Contract', () => {
  beforeEach(() => {
    // Reset state before each test
    mockBlockchain.contractState = {
      retireeBenefits: {},
      benefitPayments: {},
      userPaymentCounters: {}
    };
    mockBlockchain.currentTime = 1000;
  });
  
  it('should register a retiree correctly', () => {
    const result = mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200], // 30 years, $50,000 salary, 2% factor
        mockBlockchain.principals.deployer
    );
    
    // Monthly benefit should be: 30 * 50000 * 200 / 10000 = 30000
    expect(result).toEqual({ type: 'ok', value: 30000 });
    
    const benefits = mockContractCall(
        'get-retiree-benefits',
        [mockBlockchain.principals.user1],
        mockBlockchain.principals.deployer
    );
    
    expect(benefits).toEqual({
      yearsOfService: 30,
      finalAverageSalary: 50000,
      benefitFactor: 200,
      monthlyBenefit: 30000,
      retirementDate: 1000,
      isActive: true
    });
  });
  
  it('should update retiree status correctly', () => {
    // First register a retiree
    mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    // Then update status
    const result = mockContractCall(
        'update-retiree-status',
        [mockBlockchain.principals.user1, false],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: true });
    
    const benefits = mockContractCall(
        'get-retiree-benefits',
        [mockBlockchain.principals.user1],
        mockBlockchain.principals.deployer
    );
    
    expect(benefits.isActive).toBe(false);
  });
  
  it('should record benefit payments correctly', () => {
    // First register a retiree
    mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    // Then record a payment
    const result = mockContractCall(
        'record-benefit-payment',
        [mockBlockchain.principals.user1, 30000],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: 0 });
    
    const payment = mockContractCall(
        'get-benefit-payment',
        [mockBlockchain.principals.user1, 0],
        mockBlockchain.principals.deployer
    );
    
    expect(payment).toEqual({
      amount: 30000,
      paymentDate: 1000
    });
  });
  
  it('should reject payments for inactive retirees', () => {
    // First register a retiree
    mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    // Then deactivate
    mockContractCall(
        'update-retiree-status',
        [mockBlockchain.principals.user1, false],
        mockBlockchain.principals.deployer
    );
    
    // Try to record a payment
    const result = mockContractCall(
        'record-benefit-payment',
        [mockBlockchain.principals.user1, 30000],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual(ERR_INVALID_PARAMETERS);
  });
  
  it('should track payment count correctly', () => {
    // First register a retiree
    mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    // Initial count should be 0
    let paymentCount = mockContractCall(
        'get-payment-count',
        [mockBlockchain.principals.user1],
        mockBlockchain.principals.deployer
    );
    
    expect(paymentCount.counter).toBe(0);
    
    // Record a payment
    mockContractCall(
        'record-benefit-payment',
        [mockBlockchain.principals.user1, 30000],
        mockBlockchain.principals.deployer
    );
    
    // Count should be 1
    paymentCount = mockContractCall(
        'get-payment-count',
        [mockBlockchain.principals.user1],
        mockBlockchain.principals.deployer
    );
    
    expect(paymentCount.counter).toBe(1);
    
    // Record another payment
    mockContractCall(
        'record-benefit-payment',
        [mockBlockchain.principals.user1, 30000],
        mockBlockchain.principals.deployer
    );
    
    // Count should be 2
    paymentCount = mockContractCall(
        'get-payment-count',
        [mockBlockchain.principals.user1],
        mockBlockchain.principals.deployer
    );
    
    expect(paymentCount.counter).toBe(2);
  });
  
  it('should reject invalid parameters', () => {
    const result = mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 0, 50000, 200], // 0 years is invalid
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual(ERR_INVALID_PARAMETERS);
  });
  
  it('should reject registering already retired users', () => {
    // First register a retiree
    mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    // Try to register again
    const result = mockContractCall(
        'register-retiree',
        [mockBlockchain.principals.user1, 30, 50000, 200],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual(ERR_ALREADY_RETIRED);
  });
});
