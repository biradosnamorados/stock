import { format } from 'date-fns';

interface PackagedUnit {
  id: string;
  unique_code: string;
  display_code: string;
  weight: number;
  unit: string;
  qr_code: string;
  production_batches: {
    batch_code: string;
    production_date: string;
    expiry_date: string | null;
  };
  products: {
    name: string;
    code: string;
  };
}

interface FullPackageLabelProps {
  packagedUnit: PackagedUnit;
}

export default function FullPackageLabel({ packagedUnit }: FullPackageLabelProps) {
  const { products, production_batches } = packagedUnit;

  return (
    <div className="full-label">
      <div className="label-header">
        <h1 className="product-name">{products.name}</h1>
        <p className="product-code">Cód: {products.code}</p>
      </div>

      <div className="label-qr">
        <img src={packagedUnit.qr_code} alt="QR Code" className="qr-image" />
      </div>

      <div className="label-details">
        <div className="detail-row">
          <span className="detail-label">Embalagem</span>
          <span className="detail-value">{packagedUnit.display_code}</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Lote</span>
          <span className="detail-value">{production_batches.batch_code}</span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Produção</span>
          <span className="detail-value">
            {format(new Date(production_batches.production_date), 'dd/MM/yyyy')}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Validade</span>
          <span className="detail-value">
            {production_batches.expiry_date
              ? format(new Date(production_batches.expiry_date), 'dd/MM/yyyy')
              : 'N/A'}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Peso</span>
          <span className="detail-value">
            {packagedUnit.weight} {packagedUnit.unit}
          </span>
        </div>

        <div className="detail-row">
          <span className="detail-label">Código</span>
          <span className="detail-value code-small">{packagedUnit.unique_code}</span>
        </div>
      </div>
    </div>
  );
}
