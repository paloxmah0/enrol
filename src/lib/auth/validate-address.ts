export function isValidCardanoAddress(address: string): boolean {
  return (
    typeof address === 'string' &&
    address.length > 0 &&
    (address.startsWith('addr1') || address.startsWith('addr_test1'))
  );
}
