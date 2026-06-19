import { RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

export default function PageBreadcrumb({ items = [] }) {
  if (!items.length) return null;

  return (
    <nav className="bbx-page-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        return (
          <span key={`${item.label}-${index}`} className="bbx-page-breadcrumb-item">
            {index > 0 ? <RightOutlined className="bbx-page-breadcrumb-separator" /> : null}
            {item.to && !isLast ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'is-current' : ''}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
