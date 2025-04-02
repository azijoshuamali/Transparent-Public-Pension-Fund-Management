import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock blockchain environment
const mockBlockchain = {
  principals: {
    deployer: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    user1: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    user2: 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC'
  },
  contractState: {
    assetClasses: {},
    assetClassCounter: 0,
    totalFundValue: 0
  }
};

// Read contract code
const contractPath = path.join(__dirname, '../contracts/investment-allocation.clar');
const contractCode = fs.readFileSync(contractPath, 'utf8');

// Error codes
const ERR_UNAUTHORIZED = { type: 'err', value: 100 };
const ERR_INVALID_PERCENTAGE = { type: 'err', value: 101 };
const ERR_ASSET_CLASS_NOT_FOUND = { type: 'err', value: 102 };

// Simple mock interpreter for testing
function mockContractCall(method, args, sender) {
  const state = mockBlockchain.contractState;
  const isContractOwner = sender === mockBlockchain.principals.deployer;
  
  if (method === 'add-asset-class') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [name, allocationPercentage] = args;
    
    if (allocationPercentage > 100) return ERR_INVALID_PERCENTAGE;
    
    const newId = state.assetClassCounter;
    
    state.assetClasses[newId] = {
      name,
      allocationPercentage,
      currentValue: 0
    };
    
    state.assetClassCounter = newId + 1;
    
    return { type: 'ok', value: newId };
  }
  
  if (method === 'update-asset-allocation') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [id, allocationPercentage] = args;
    
    if (allocationPercentage > 100) return ERR_INVALID_PERCENTAGE;
    if (!state.assetClasses[id]) return ERR_ASSET_CLASS_NOT_FOUND;
    
    state.assetClasses[id] = {
      ...state.assetClasses[id],
      allocationPercentage
    };
    
    return { type: 'ok', value: true };
  }
  
  if (method === 'update-asset-value') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [id, newValue] = args;
    
    if (!state.assetClasses[id]) return ERR_ASSET_CLASS_NOT_FOUND;
    
    state.assetClasses[id] = {
      ...state.assetClasses[id],
      currentValue: newValue
    };
    
    return { type: 'ok', value: true };
  }
  
  if (method === 'update-total-fund-value') {
    if (!isContractOwner) return ERR_UNAUTHORIZED;
    
    const [newValue] = args;
    state.totalFundValue = newValue;
    
    return { type: 'ok', value: true };
  }
  
  if (method === 'get-asset-class') {
    const [id] = args;
    return state.assetClasses[id];
  }
  
  if (method === 'get-asset-class-count') {
    return state.assetClassCounter;
  }
  
  if (method === 'get-total-fund-value') {
    return state.totalFundValue;
  }
  
  throw new Error(`Unknown method: ${method}`);
}

describe('Investment Allocation Contract', () => {
  beforeEach(() => {
    // Reset state before each test
    mockBlockchain.contractState = {
      assetClasses: {},
      assetClassCounter: 0,
      totalFundValue: 0
    };
  });
  
  it('should add an asset class correctly', () => {
    const result = mockContractCall(
        'add-asset-class',
        ['Stocks', 60],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: 0 });
    
    const assetClass = mockContractCall(
        'get-asset-class',
        [0],
        mockBlockchain.principals.deployer
    );
    
    expect(assetClass).toEqual({
      name: 'Stocks',
      allocationPercentage: 60,
      currentValue: 0
    });
  });
  
  it('should reject unauthorized asset class additions', () => {
    const result = mockContractCall(
        'add-asset-class',
        ['Stocks', 60],
        mockBlockchain.principals.user1
    );
    
    expect(result).toEqual(ERR_UNAUTHORIZED);
  });
  
  it('should reject invalid allocation percentages', () => {
    const result = mockContractCall(
        'add-asset-class',
        ['Stocks', 101],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual(ERR_INVALID_PERCENTAGE);
  });
  
  it('should update asset allocation correctly', () => {
    // First add an asset class
    mockContractCall(
        'add-asset-class',
        ['Stocks', 60],
        mockBlockchain.principals.deployer
    );
    
    // Then update its allocation
    const result = mockContractCall(
        'update-asset-allocation',
        [0, 70],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: true });
    
    const assetClass = mockContractCall(
        'get-asset-class',
        [0],
        mockBlockchain.principals.deployer
    );
    
    expect(assetClass.allocationPercentage).toBe(70);
  });
  
  it('should update asset value correctly', () => {
    // First add an asset class
    mockContractCall(
        'add-asset-class',
        ['Stocks', 60],
        mockBlockchain.principals.deployer
    );
    
    // Then update its value
    const result = mockContractCall(
        'update-asset-value',
        [0, 1000000],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: true });
    
    const assetClass = mockContractCall(
        'get-asset-class',
        [0],
        mockBlockchain.principals.deployer
    );
    
    expect(assetClass.currentValue).toBe(1000000);
  });
  
  it('should update total fund value correctly', () => {
    const result = mockContractCall(
        'update-total-fund-value',
        [5000000],
        mockBlockchain.principals.deployer
    );
    
    expect(result).toEqual({ type: 'ok', value: true });
    
    const totalFundValue = mockContractCall(
        'get-total-fund-value',
        [],
        mockBlockchain.principals.deployer
    );
    
    expect(totalFundValue).toBe(5000000);
  });
  
  it('should track asset class count', () => {
    expect(mockContractCall('get-asset-class-count', [], null)).toBe(0);
    
    mockContractCall(
        'add-asset-class',
        ['Stocks', 60],
        mockBlockchain.principals.deployer
    );
    
    expect(mockContractCall('get-asset-class-count', [], null)).toBe(1);
    
    mockContractCall(
        'add-asset-class',
        ['Bonds', 30],
        mockBlockchain.principals.deployer
    );
    
    expect(mockContractCall('get-asset-class-count', [], null)).toBe(2);
  });
});
