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

interface CompactPackageLabelProps {
  packagedUnit: PackagedUnit;
}

export default function CompactPackageLabel({ packagedUnit }: CompactPackageLabelProps) {
  const { production_batches } = packagedUnit;

  return (
    <div className="compact-label">
      <div className="compact-header">
        <span className="compact-code">{packagedUnit.display_code}</span>
      </div>

      <div className="compact-qr">
        <img src={packagedUnit.qr_code} alt="QR Code" />
      </div>

      <div className="compact-info">
        <div className="compact-row">
          <span className="compact-weight">
            {packagedUnit.weight} {packagedUnit.unit}
          </span>
        </div>
        <div className="compact-row">
          <span className="compact-expiry">
            Val: {production_batches.expiry_date
              ? format(new Date(production_batches.expiry_date), 'dd/MM')
              : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
