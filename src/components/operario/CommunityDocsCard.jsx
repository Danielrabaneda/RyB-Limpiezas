import React from 'react';

export default function CommunityDocsCard({ communityDocs }) {
  if (!communityDocs || communityDocs.length === 0) return null;

  return (
    <div className="card mb-4 animate-fadeIn">
      <h3 className="card-title text-sm mb-3" style={{ fontSize: 'var(--font-sm)', fontWeight: 'bold' }}>
        📄 Biblioteca Digital (Instrucciones)
      </h3>
      <div className="flex flex-col gap-2">
        {communityDocs.map(doc => (
          <div 
            key={doc.id} 
            className="flex items-center justify-between p-2" 
            style={{ background: 'var(--color-bg-light)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
          >
            <span className="text-xs font-semibold truncate" style={{ flex: 1, marginRight: '8px' }}>
              📄 {doc.title}
            </span>
            <a 
              href={doc.fileUrl} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-secondary btn-xs font-bold"
              style={{ textDecoration: 'none', padding: '4px 8px', whiteSpace: 'nowrap' }}
            >
              Abrir PDF
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
