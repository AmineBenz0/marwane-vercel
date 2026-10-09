export const productUsageLabels = { vendu: 'Vendu', achete: 'Acheté' };

export const getProductUsage = (product) => {
  if (product?.usage === 'vendu' || product?.usage === 'achete') return product.usage;
  // Compatibility with previously deployed API responses.
  return product?.pour_clients && (
    !product.pour_fournisseurs || product.type_produit === 'produit_fini'
  ) ? 'vendu' : 'achete';
};
