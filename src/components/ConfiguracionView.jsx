import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase';
import {
  mergeCatalogProducts,
  saveCatalogProduct,
  seedDefaultCatalogIfEmpty,
  STORE_CATALOG_PATH,
  updateCatalogProduct,
} from '../services/storeCatalog';
import {
  mergeStoreCategories,
  saveStoreCategory,
  seedDefaultStoreCategoriesIfEmpty,
  STORE_CATEGORIES_PATH,
  updateStoreCategory,
} from '../services/storeCategories';

const emptyProduct = {
  code: '',
  name: '',
  price: '',
  unit: 'lb',
  category: 'res',
  subcategory: 'Linea Diaria',
  active: true,
  promo: false,
  image: '',
  description: '',
};

const emptyCategory = {
  id: '',
  label: '',
  subcategoriesText: '',
  active: true,
  sortOrder: '',
};

export default function ConfiguracionView() {
  const [products, setProducts] = useState(() => mergeCatalogProducts());
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATALOG_PATH), (snapshot) => {
      setProducts(mergeCatalogProducts(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATEGORIES_PATH), (snapshot) => {
      setCategories(mergeStoreCategories(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return products;
    }

    return products.filter((product) =>
      [product.code, product.name, product.category, product.subcategory]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [products, search]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.active !== false),
    [categories]
  );

  const catalogCategories = useMemo(() => {
    if (form.category && !activeCategories.some((category) => category.id === form.category)) {
      const currentCategory = categories.find((category) => category.id === form.category);
      return currentCategory ? [...activeCategories, currentCategory] : activeCategories;
    }

    return activeCategories;
  }, [activeCategories, categories, form.category]);

  const selectedFormCategory = useMemo(
    () => catalogCategories.find((category) => category.id === form.category) || catalogCategories[0],
    [catalogCategories, form.category]
  );

  const formSubcategories = selectedFormCategory?.subcategories || [];

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCategoryForm = (field, value) => {
    setCategoryForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCategory = (categoryId) => {
    const nextCategory = catalogCategories.find((category) => category.id === categoryId);
    setForm((current) => ({
      ...current,
      category: categoryId,
      subcategory: nextCategory?.subcategories?.[0] || '',
    }));
  };

  const getCategoryLabel = (categoryId) =>
    categories.find((category) => category.id === categoryId)?.label || categoryId || '-';

  const editCategory = (category) => {
    setCategoryForm({
      id: category.id || '',
      label: category.label || '',
      subcategoriesText: (category.subcategories || []).join('\n'),
      active: category.active !== false,
      sortOrder: category.sortOrder ?? '',
    });
  };

  const editProduct = (product) => {
    setForm({
      code: product.code || '',
      name: product.name || '',
      price: product.price || '',
      unit: product.unit || 'lb',
      category: product.category || 'res',
      subcategory: product.subcategory || 'Linea Diaria',
      active: product.active !== false,
      promo: Boolean(product.promo),
      image: product.image || '',
      description: product.description || '',
    });
  };

  const handleImageFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateForm('image', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await saveCatalogProduct({
        ...form,
        price: Number(form.price || 0),
      });
      setMessage('Producto guardado.');
    } catch (error) {
      console.error('Error guardando producto:', error);
      setMessage('No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSavingCategory(true);
    setMessage('');

    try {
      await saveStoreCategory({
        id: categoryForm.id,
        label: categoryForm.label,
        subcategories: categoryForm.subcategoriesText,
        active: categoryForm.active,
        sortOrder: categoryForm.sortOrder === '' ? categories.length * 10 : Number(categoryForm.sortOrder || 0),
      });
      setCategoryForm(emptyCategory);
      setMessage('Categoria guardada.');
    } catch (error) {
      console.error('Error guardando categoria:', error);
      setMessage('No se pudo guardar la categoria.');
    } finally {
      setSavingCategory(false);
    }
  };

  const toggleProduct = async (product) => {
    try {
      await updateCatalogProduct(product.code, { active: product.active === false });
    } catch (error) {
      console.error('Error actualizando producto:', error);
      setMessage('No se pudo actualizar el producto.');
    }
  };

  const toggleCategory = async (category) => {
    try {
      await updateStoreCategory(category.id, { active: category.active === false });
    } catch (error) {
      console.error('Error actualizando categoria:', error);
      setMessage('No se pudo actualizar la categoria.');
    }
  };

  const seedCatalog = async () => {
    setSaving(true);
    setMessage('');
    try {
      const seeded = await seedDefaultCatalogIfEmpty();
      setMessage(seeded ? 'Catalogo base creado.' : 'El catalogo ya existe.');
    } catch (error) {
      console.error('Error inicializando catalogo:', error);
      setMessage('No se pudo inicializar el catalogo.');
    } finally {
      setSaving(false);
    }
  };

  const seedCategories = async () => {
    setSavingCategory(true);
    setMessage('');
    try {
      const seeded = await seedDefaultStoreCategoriesIfEmpty();
      setMessage(seeded ? 'Categorias base creadas.' : 'Las categorias ya existen.');
    } catch (error) {
      console.error('Error inicializando categorias:', error);
      setMessage('No se pudieron inicializar las categorias.');
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        background: '#f8fafc',
        padding: '24px',
        color: '#0f172a',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        .cfg-shell * { box-sizing: border-box; }
        .cfg-button {
          border: 0;
          border-radius: 8px;
          padding: 12px 14px;
          background: #dc2626;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .cfg-button.secondary {
          background: #fff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
        }
        .cfg-input,
        .cfg-textarea,
        .cfg-select {
          width: 100%;
          min-height: 42px;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          padding: 10px 12px;
          font: inherit;
          outline: 0;
          background: #fff;
        }
        .cfg-textarea {
          min-height: 84px;
          resize: vertical;
        }
        .cfg-table {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        .cfg-table th,
        .cfg-table td {
          padding: 12px;
          border-bottom: 1px solid #edf2f7;
          text-align: left;
          vertical-align: middle;
          font-size: 14px;
        }
        .cfg-table th {
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
        }
        .cfg-photo {
          width: 58px;
          height: 58px;
          border-radius: 8px;
          object-fit: contain;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
        }
        .cfg-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          background: #ecfdf5;
          color: #047857;
        }
        .cfg-badge.off {
          background: #fee2e2;
          color: #b91c1c;
        }
        @media (max-width: 980px) {
          .cfg-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="cfg-shell">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
              Configuraciones / Tienda Virtual / Catalogo
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: 30 }}>Catalogo de tienda virtual</h1>
          </div>
          <button type="button" className="cfg-button secondary" onClick={seedCatalog} disabled={saving}>
            Inicializar catalogo base
          </button>
        </div>

        {message && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: '#fff',
              border: '1px solid #e2e8f0',
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        )}

        <section
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            marginTop: 18,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Categorias y subcategorias</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
                Estas opciones alimentan los filtros de la tienda y las listas del catalogo.
              </p>
            </div>
            <button type="button" className="cfg-button secondary" onClick={seedCategories} disabled={savingCategory}>
              Inicializar categorias base
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
              gap: 14,
              marginTop: 14,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              {categories.map((category) => (
                <div
                  key={category.id}
                  style={{
                    border: '1px solid #edf2f7',
                    borderRadius: 8,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <strong>{category.label}</strong>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                      {(category.subcategories || []).join(' | ') || 'Sin subcategorias'}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <span className={`cfg-badge ${category.active === false ? 'off' : ''}`}>
                        {category.active === false ? 'Inactiva' : 'Activa'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" className="cfg-button secondary" onClick={() => editCategory(category)}>
                      Editar
                    </button>
                    <button type="button" className="cfg-button secondary" onClick={() => toggleCategory(category)}>
                      {category.active === false ? 'Activar' : 'Desactivar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={saveCategory} style={{ display: 'grid', gap: 10 }}>
              <input
                className="cfg-input"
                value={categoryForm.label}
                onChange={(event) => updateCategoryForm('label', event.target.value)}
                placeholder="Nombre de categoria"
              />
              <textarea
                className="cfg-textarea"
                value={categoryForm.subcategoriesText}
                onChange={(event) => updateCategoryForm('subcategoriesText', event.target.value)}
                placeholder="Subcategorias, una por linea o separadas por coma"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  className="cfg-input"
                  type="number"
                  value={categoryForm.sortOrder}
                  onChange={(event) => updateCategoryForm('sortOrder', event.target.value)}
                  placeholder="Orden"
                />
                <select
                  className="cfg-select"
                  value={categoryForm.active ? 'activo' : 'inactivo'}
                  onChange={(event) => updateCategoryForm('active', event.target.value === 'activo')}
                >
                  <option value="activo">Activa</option>
                  <option value="inactivo">Inactiva</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button type="submit" className="cfg-button" disabled={savingCategory}>
                  {savingCategory ? 'Guardando...' : 'Guardar categoria'}
                </button>
                <button
                  type="button"
                  className="cfg-button secondary"
                  onClick={() => setCategoryForm(emptyCategory)}
                >
                  Nueva
                </button>
              </div>
            </form>
          </div>
        </section>

        <div
          className="cfg-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 0.85fr)',
            gap: 18,
            marginTop: 18,
            alignItems: 'start',
          }}
        >
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
                alignItems: 'center',
              }}
            >
              <input
                className="cfg-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar producto"
                style={{ maxWidth: 360 }}
              />
              <strong>{filteredProducts.length} productos</strong>
            </div>

            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Producto</th>
                  <th>Categoria</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.code}>
                    <td>
                      <img className="cfg-photo" src={product.image || '/tienda/branding/logo.png'} alt="" />
                    </td>
                    <td>
                      <strong>{product.name}</strong>
                      <div style={{ color: '#64748b', marginTop: 4 }}>{product.code}</div>
                    </td>
                    <td>
                      <strong>{getCategoryLabel(product.category)}</strong>
                      <div style={{ color: '#64748b', marginTop: 4 }}>{product.subcategory || '-'}</div>
                      {product.promo && (
                        <div style={{ marginTop: 6 }}>
                          <span className="cfg-badge">Promocion</span>
                        </div>
                      )}
                    </td>
                    <td>C$ {Number(product.price || 0).toFixed(2)}</td>
                    <td>
                      <span className={`cfg-badge ${product.active === false ? 'off' : ''}`}>
                        {product.active === false ? 'Inactivo' : 'Activo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="cfg-button secondary" onClick={() => editProduct(product)}>
                          Editar
                        </button>
                        <button type="button" className="cfg-button secondary" onClick={() => toggleProduct(product)}>
                          {product.active === false ? 'Activar' : 'Desactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <form
            onSubmit={saveProduct}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 16,
              display: 'grid',
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22 }}>Producto</h2>
            <input
              className="cfg-input"
              value={form.code}
              onChange={(event) => updateForm('code', event.target.value)}
              placeholder="Codigo SICAR"
            />
            <input
              className="cfg-input"
              value={form.name}
              onChange={(event) => updateForm('name', event.target.value)}
              placeholder="Nombre"
            />
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => updateForm('price', event.target.value)}
              placeholder="Precio"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select
                className="cfg-select"
                value={form.unit}
                onChange={(event) => updateForm('unit', event.target.value)}
              >
                <option value="lb">lb</option>
                <option value="unidad">unidad</option>
              </select>
              <select
                className="cfg-select"
                value={form.active ? 'activo' : 'inactivo'}
                onChange={(event) => updateForm('active', event.target.value === 'activo')}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <select
              className="cfg-select"
              value={form.promo ? 'promo' : 'normal'}
              onChange={(event) => updateForm('promo', event.target.value === 'promo')}
            >
              <option value="normal">Producto normal</option>
              <option value="promo">Promocion / combo</option>
            </select>
            <select
              className="cfg-select"
              value={form.category}
              onChange={(event) => updateCategory(event.target.value)}
            >
              {catalogCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
            <select
              className="cfg-select"
              value={form.subcategory}
              onChange={(event) => updateForm('subcategory', event.target.value)}
            >
              {formSubcategories.map((subcategory) => (
                <option key={subcategory} value={subcategory}>
                  {subcategory}
                </option>
              ))}
              {!formSubcategories.includes(form.subcategory) && form.subcategory && (
                <option value={form.subcategory}>{form.subcategory}</option>
              )}
            </select>
            <textarea
              className="cfg-textarea"
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              placeholder="Descripcion corta"
            />
            <input
              className="cfg-input"
              value={form.image}
              onChange={(event) => updateForm('image', event.target.value)}
              placeholder="URL o imagen guardada"
            />
            <input className="cfg-input" type="file" accept="image/*" onChange={handleImageFile} />
            {form.image && (
              <img
                src={form.image}
                alt="Vista previa"
                style={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'contain',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="cfg-button" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar producto'}
              </button>
              <button type="button" className="cfg-button secondary" onClick={() => setForm(emptyProduct)}>
                Nuevo
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
