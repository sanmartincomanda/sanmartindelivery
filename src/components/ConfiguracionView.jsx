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
import {
  STORE_USERS_PATH,
  updateStoreUserPassword,
} from '../services/storeUsers';

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
  const [section, setSection] = useState('catalogo');
  const [usersTab, setUsersTab] = useState('administrativo');
  const [products, setProducts] = useState(() => mergeCatalogProducts());
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [storeUsers, setStoreUsers] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [passwordForms, setPasswordForms] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingPasswordKey, setSavingPasswordKey] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

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

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_USERS_PATH), (snapshot) => {
      const data = snapshot.val() || {};
      const users = Object.entries(data).map(([key, value]) => ({
        key,
        ...value,
        hasPassword: Boolean(value?.passwordHash),
      }));

      users.sort((left, right) =>
        String(left.nombre || '').localeCompare(String(right.nombre || ''))
      );

      setStoreUsers(users);
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

  const filteredStoreUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return storeUsers;
    }

    return storeUsers.filter((user) =>
      [user.nombre, user.telefono, user.codigo, user.direccion]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [storeUsers, userSearch]);

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

  const updatePasswordForm = (userKey, field, value) => {
    setPasswordForms((current) => ({
      ...current,
      [userKey]: {
        ...(current[userKey] || {}),
        [field]: value,
      },
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

  const saveClientPassword = async (event, user) => {
    event.preventDefault();
    const formData = passwordForms[user.key] || {};
    const password = String(formData.password || '').trim();
    const confirmPassword = String(formData.confirmPassword || '').trim();

    if (password.length < 4) {
      setMessage('La contrasena debe tener al menos 4 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Las contrasenas no coinciden.');
      return;
    }

    setSavingPasswordKey(user.key);
    setMessage('');

    try {
      await updateStoreUserPassword(user, password);
      setPasswordForms((current) => ({
        ...current,
        [user.key]: { password: '', confirmPassword: '' },
      }));
      setMessage(`Contrasena actualizada para ${user.nombre || user.telefono}.`);
    } catch (error) {
      console.error('Error actualizando contrasena de cliente:', error);
      setMessage('No se pudo actualizar la contrasena del cliente.');
    } finally {
      setSavingPasswordKey('');
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
        .cfg-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .cfg-tab {
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 11px 16px;
          background: #fff;
          color: #475569;
          cursor: pointer;
          font: inherit;
          font-weight: 900;
        }
        .cfg-tab.active {
          background: #0f172a;
          border-color: #0f172a;
          color: #fff;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
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
              {section === 'usuarios'
                ? 'Configuraciones / Usuarios'
                : 'Configuraciones / Tienda Virtual / Catalogo'}
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: 30 }}>
              {section === 'usuarios' ? 'Usuarios' : 'Catalogo de tienda virtual'}
            </h1>
          </div>
          {section === 'catalogo' && (
            <button type="button" className="cfg-button secondary" onClick={seedCatalog} disabled={saving}>
              Inicializar catalogo base
            </button>
          )}
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

        <div className="cfg-tabs">
          <button
            type="button"
            className={`cfg-tab ${section === 'catalogo' ? 'active' : ''}`}
            onClick={() => setSection('catalogo')}
          >
            Tienda Virtual
          </button>
          <button
            type="button"
            className={`cfg-tab ${section === 'usuarios' ? 'active' : ''}`}
            onClick={() => setSection('usuarios')}
          >
            Usuarios
          </button>
        </div>

        {section === 'catalogo' ? (
          <>
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
          </>
        ) : (
          <UsersManager
            usersTab={usersTab}
            setUsersTab={setUsersTab}
            storeUsers={storeUsers}
            filteredStoreUsers={filteredStoreUsers}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            passwordForms={passwordForms}
            updatePasswordForm={updatePasswordForm}
            saveClientPassword={saveClientPassword}
            savingPasswordKey={savingPasswordKey}
          />
        )}
      </div>
    </div>
  );
}

function UsersManager({
  usersTab,
  setUsersTab,
  storeUsers,
  filteredStoreUsers,
  userSearch,
  setUserSearch,
  passwordForms,
  updatePasswordForm,
  saveClientPassword,
  savingPasswordKey,
}) {
  return (
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
          <h2 style={{ margin: 0, fontSize: 22 }}>Gestion de usuarios</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
            Separa usuarios internos administrativos de usuarios clientes de la tienda virtual.
          </p>
        </div>
        <div className="cfg-tabs" style={{ marginTop: 0 }}>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'administrativo' ? 'active' : ''}`}
            onClick={() => setUsersTab('administrativo')}
          >
            Administrativo
          </button>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'clientes' ? 'active' : ''}`}
            onClick={() => setUsersTab('clientes')}
          >
            Clientes
          </button>
        </div>
      </div>

      {usersTab === 'administrativo' ? (
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          <div
            style={{
              border: '1px solid #edf2f7',
              borderRadius: 8,
              padding: 16,
              background: '#f8fafc',
            }}
          >
            <div className="cfg-badge">Administrativo</div>
            <h3 style={{ margin: '12px 0 4px', fontSize: 20 }}>Panel interno</h3>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5, fontWeight: 700 }}>
              Este espacio queda separado para los usuarios del sistema administrativo.
            </p>
            <div style={{ marginTop: 14, color: '#0f172a', fontWeight: 900 }}>
              Usuario actual: delivery
            </div>
          </div>
          <div
            style={{
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              padding: 16,
              background: '#fff',
              color: '#64748b',
              lineHeight: 1.5,
              fontWeight: 700,
            }}
          >
            En esta etapa dejamos listo el modulo administrativo separado. El cambio de contrasena solicitado
            esta disponible en la pestana Clientes.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              className="cfg-input"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Buscar cliente por nombre, telefono o codigo"
              style={{ maxWidth: 420 }}
            />
            <strong>{filteredStoreUsers.length} de {storeUsers.length} clientes</strong>
          </div>

          {filteredStoreUsers.length === 0 ? (
            <div
              style={{
                padding: 28,
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                color: '#64748b',
                textAlign: 'center',
                fontWeight: 800,
              }}
            >
              No hay clientes de tienda virtual para mostrar.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredStoreUsers.map((user) => {
                const passwordForm = passwordForms[user.key] || {};
                return (
                  <form
                    key={user.key}
                    onSubmit={(event) => saveClientPassword(event, user)}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 8,
                      padding: 14,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 17 }}>{user.nombre || 'Cliente sin nombre'}</strong>
                      <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                        {user.telefono || 'Sin telefono'} {user.codigo ? `| ${user.codigo}` : ''}
                      </div>
                      <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        {user.direccion || 'Sin direccion guardada'}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={`cfg-badge ${user.hasPassword ? '' : 'off'}`}>
                          {user.hasPassword ? 'Con contrasena' : 'Sin contrasena'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        className="cfg-input"
                        type="password"
                        value={passwordForm.password || ''}
                        onChange={(event) => updatePasswordForm(user.key, 'password', event.target.value)}
                        placeholder="Nueva contrasena"
                      />
                      <input
                        className="cfg-input"
                        type="password"
                        value={passwordForm.confirmPassword || ''}
                        onChange={(event) => updatePasswordForm(user.key, 'confirmPassword', event.target.value)}
                        placeholder="Confirmar contrasena"
                      />
                      <button type="submit" className="cfg-button" disabled={savingPasswordKey === user.key}>
                        {savingPasswordKey === user.key ? 'Actualizando...' : 'Cambiar contrasena'}
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
