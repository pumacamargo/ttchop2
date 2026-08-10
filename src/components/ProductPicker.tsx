import React from 'react';
import { REGION_LABELS } from '../services/databaseService';
import type { Product } from '../services/databaseService';

interface ProductPickerProps {
  products: Product[];
  selectedProductId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const ProductPicker: React.FC<ProductPickerProps> = ({ products, selectedProductId, onChange, disabled }) => {
  const regionOrder = Object.keys(REGION_LABELS);
  const grouped: Record<string, Product[]> = {};
  for (const p of products) {
    const key = p.region && REGION_LABELS[p.region] ? p.region : '__other__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }
  const groupKeys = [
    ...regionOrder.filter(k => grouped[k]),
    ...(grouped['__other__'] ? ['__other__'] : []),
  ];

  if (products.length === 0) {
    return <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>No products yet.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {groupKeys.map(key => (
        <div key={key}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.3rem' }}>
            {key === '__other__' ? 'Other' : REGION_LABELS[key]}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {grouped[key].map(p => {
              const selected = selectedProductId === p.id;
              const thumb = p.modelSheetUrls?.[0];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !disabled && onChange(p.id)}
                  disabled={disabled}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    width: '100%',
                    textAlign: 'left',
                    padding: '5px 10px 5px 5px',
                    borderRadius: '10px',
                    border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                    background: selected ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)',
                    cursor: disabled ? 'default' : 'pointer',
                    transition: 'all 0.13s ease',
                  }}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: '34px', height: '34px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                    />
                  ) : (
                    <div style={{ width: '34px', height: '34px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>
                      📦
                    </div>
                  )}
                  <span style={{ fontSize: '0.78rem', fontWeight: selected ? 600 : 400, color: selected ? '#fff' : 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  {selected && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', flexShrink: 0 }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
