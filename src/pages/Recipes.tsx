import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, CreditCard as Edit3, ChefHat, Save, X } from 'lucide-react';

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  is_recipe_input: boolean;
  is_recipe_output: boolean;
}

interface RecipeIngredient {
  id?: string;
  input_product_id: string;
  quantity: string;
  unit: string;
  notes: string;
  products?: {
    code: string;
    name: string;
    unit: string;
  };
}

interface Recipe {
  id: string;
  code: string;
  name: string;
  output_product_id: string;
  output_quantity: number;
  output_unit: string;
  instructions: string | null;
  preparation_time_minutes: number | null;
  active: boolean;
  products: {
    code: string;
    name: string;
    unit: string;
  };
  recipe_ingredients: RecipeIngredient[];
}

export default function Recipes() {
  const { profile } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    output_product_id: '',
    output_quantity: '1',
    output_unit: 'kg',
    instructions: '',
    preparation_time_minutes: '',
  });

  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([
    { input_product_id: '', quantity: '', unit: 'kg', notes: '' }
  ]);

  useEffect(() => {
    loadData();
  }, [profile]);

  const loadData = async () => {
    try {
      const [recipesRes, productsRes] = await Promise.all([
        supabase
          .from('recipes')
          .select(`
            *,
            products!recipes_output_product_id_fkey(code, name, unit),
            recipe_ingredients(
              *,
              products!recipe_ingredients_input_product_id_fkey(code, name, unit)
            )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('id, code, name, unit, is_recipe_input, is_recipe_output')
          .eq('active', true)
          .order('name'),
      ]);

      if (recipesRes.data) setRecipes(recipesRes.data as Recipe[]);
      if (productsRes.data) setProducts(productsRes.data as Product[]);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIngredient = () => {
    setIngredients([...ingredients, { input_product_id: '', quantity: '', unit: 'kg', notes: '' }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof RecipeIngredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingId(recipe.id);
    setFormData({
      code: recipe.code,
      name: recipe.name,
      output_product_id: recipe.output_product_id,
      output_quantity: recipe.output_quantity.toString(),
      output_unit: recipe.output_unit,
      instructions: recipe.instructions || '',
      preparation_time_minutes: recipe.preparation_time_minutes?.toString() || '',
    });
    setIngredients(recipe.recipe_ingredients.map(ing => ({
      input_product_id: ing.input_product_id,
      quantity: ing.quantity.toString(),
      unit: ing.unit,
      notes: ing.notes || '',
    })));
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const recipeData = {
        code: formData.code,
        name: formData.name,
        output_product_id: formData.output_product_id,
        output_quantity: parseFloat(formData.output_quantity),
        output_unit: formData.output_unit,
        instructions: formData.instructions || null,
        preparation_time_minutes: formData.preparation_time_minutes ? parseInt(formData.preparation_time_minutes) : null,
        unit_id: profile?.unit_id,
        created_by: profile?.id,
      };

      let recipeId: string;

      if (editingId) {
        const { error: updateError } = await supabase
          .from('recipes')
          .update(recipeData)
          .eq('id', editingId);

        if (updateError) throw updateError;

        await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', editingId);

        recipeId = editingId;
      } else {
        const { data: newRecipe, error: insertError } = await supabase
          .from('recipes')
          .insert(recipeData)
          .select()
          .single();

        if (insertError) throw insertError;
        recipeId = newRecipe.id;
      }

      const ingredientsData = ingredients
        .filter(ing => ing.input_product_id && ing.quantity)
        .map(ing => ({
          recipe_id: recipeId,
          input_product_id: ing.input_product_id,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit,
          notes: ing.notes || null,
        }));

      if (ingredientsData.length > 0) {
        const { error: ingredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientsData);

        if (ingredientsError) throw ingredientsError;
      }

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: editingId ? 'update_recipe' : 'create_recipe',
        entity: 'recipes',
        entity_id: recipeId,
        changes: { ...recipeData, ingredients_count: ingredientsData.length },
      });

      resetForm();
      loadData();
    } catch (err: any) {
      console.error('Error saving recipe:', err);
      alert(err.message || 'Erro ao guardar receita');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar a receita "${name}"?`)) return;

    try {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'delete_recipe',
        entity: 'recipes',
        entity_id: id,
      });

      loadData();
    } catch (err: any) {
      console.error('Error deleting recipe:', err);
      alert(err.message || 'Erro ao eliminar receita');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      output_product_id: '',
      output_quantity: '1',
      output_unit: 'kg',
      instructions: '',
      preparation_time_minutes: '',
    });
    setIngredients([{ input_product_id: '', quantity: '', unit: 'kg', notes: '' }]);
    setShowForm(false);
    setEditingId(null);
  };

  const outputProducts = products.filter(p => p.is_recipe_output);
  const inputProducts = products.filter(p => p.is_recipe_input);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">A carregar receitas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Receitas / BOM</h1>
          <p className="text-slate-600 mt-2">Gestão de receitas de produção</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          <span>Nova Receita</span>
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            {editingId ? 'Editar Receita' : 'Nova Receita'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Código da Receita *
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ex: REC-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nome da Receita *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="ex: Molho Francesinha"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Produto Final *
                </label>
                <select
                  required
                  value={formData.output_product_id}
                  onChange={(e) => {
                    const product = outputProducts.find(p => p.id === e.target.value);
                    setFormData({
                      ...formData,
                      output_product_id: e.target.value,
                      output_unit: product?.unit || 'kg'
                    });
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Selecione o produto</option>
                  {outputProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.code} - {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Quantidade Produzida *
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    step="0.001"
                    required
                    value={formData.output_quantity}
                    onChange={(e) => setFormData({ ...formData, output_quantity: e.target.value })}
                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="1"
                  />
                  <input
                    type="text"
                    value={formData.output_unit}
                    disabled
                    className="w-24 px-4 py-2 border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tempo de Preparação (minutos)
                </label>
                <input
                  type="number"
                  value={formData.preparation_time_minutes}
                  onChange={(e) => setFormData({ ...formData, preparation_time_minutes: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="60"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Instruções de Preparação
              </label>
              <textarea
                rows={4}
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Descreva os passos da receita..."
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-md font-semibold text-slate-800">Ingredientes</h3>
                <button
                  type="button"
                  onClick={handleAddIngredient}
                  className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 px-3 py-1 rounded-lg hover:bg-blue-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar Ingrediente</span>
                </button>
              </div>

              <div className="space-y-3">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                    <div className="flex-1">
                      <select
                        required
                        value={ingredient.input_product_id}
                        onChange={(e) => handleIngredientChange(index, 'input_product_id', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Selecione ingrediente</option>
                        {inputProducts.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.code} - {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32">
                      <input
                        type="number"
                        step="0.001"
                        required
                        value={ingredient.quantity}
                        onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Qtd"
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        value={ingredient.unit}
                        onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="un"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-4 border-t border-slate-200">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                <span>{submitting ? 'A guardar...' : 'Guardar Receita'}</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="flex items-center space-x-2 px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                <X className="w-5 h-5" />
                <span>Cancelar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Código</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nome</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Produto Final</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Quantidade</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Ingredientes</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {recipes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <ChefHat className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                    <p>Ainda não há receitas criadas</p>
                  </td>
                </tr>
              ) : (
                recipes.map((recipe) => (
                  <tr key={recipe.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm font-medium text-slate-800">
                        {recipe.code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-slate-800">{recipe.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-slate-800">{recipe.products.name}</p>
                        <p className="text-xs text-slate-500">{recipe.products.code}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">
                        {recipe.output_quantity} {recipe.output_unit}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {recipe.recipe_ingredients.length} ingredientes
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEdit(recipe)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(recipe.id, recipe.name)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
